import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";

import { Button, ButtonGroup } from "react-bootstrap";
import PropTypes from "prop-types";
import MDEditor from "@uiw/react-md-editor";
import rehypeSanitize from "rehype-sanitize";
import { selectNodeService, formatDate } from "../../services/service";
import JSONDigger from "../../services/jsonDigger";
import createExampleOrganisation from "../../services/createExampleOrganisation";
import createNoteNode from "../../services/createNoteNode";
import { toPng, toBlob, toJpeg, toSvg } from "html-to-image";
// import * as htmlToImage from "html-to-image";
// import { elementToSVG, inlineResources } from "dom-to-svg";
import jsPDF from "jspdf";
import ChartNode from "./ChartNode";
import FreeLayoutCanvas from "./FreeLayoutCanvas";
import "./ChartContainer.scss";
import { exportRDF } from "../../services/exportRDF";
import { buildCustomFontFaceCss } from "../../services/customFonts";

import "../../services/registerFiles";

const customSchema = {
  attributes: {
    "*": ["style"],
    div: ["style"],
  },
};

const propTypes = {
  data: PropTypes.object.isRequired,
  pan: PropTypes.bool,
  zoom: PropTypes.bool,
  zoomoutLimit: PropTypes.number,
  zoominLimit: PropTypes.number,
  containerClass: PropTypes.string,
  chartClass: PropTypes.string,
  draggable: PropTypes.bool,
  collapsible: PropTypes.bool,
  multipleSelect: PropTypes.bool,
  onClickNode: PropTypes.func,
  onDragNode: PropTypes.func,
  onClickChart: PropTypes.func,
  sendDataUp: PropTypes.func,
  onContextMenu: PropTypes.func,
  onCloseContextMenu: PropTypes.func,
  contentEditable: PropTypes.bool,
  onAddInitNode: PropTypes.func,
  onPasteNodeAtPosition: PropTypes.func,
  canPasteAtPosition: PropTypes.bool,
};

const defaultProps = {
  pan: false,
  zoom: false,
  zoomoutLimit: 0.2,
  zoominLimit: 7,
  containerClass: "",
  chartClass: "",
  draggable: true,
  collapsible: false,
  multipleSelect: false,
  contentEditable: true,
  onPasteNodeAtPosition: null,
  canPasteAtPosition: false,
};

const VIEWPORT_MARGIN = 32;
const ROOT_NODE_TOP_MARGIN = 24;

const parseTransformMatrix = (matrixValue = "") => {
  if (!matrixValue) {
    return { scale: 1, x: 0, y: 0 };
  }

  const values = (matrixValue.match(/-?\d*\.?\d+/g) || []).map(Number);

  if (matrixValue.startsWith("matrix3d(") && values.length >= 14) {
    return {
      scale: Number.isFinite(values[0]) ? values[0] : 1,
      x: Number.isFinite(values[12]) ? values[12] : 0,
      y: Number.isFinite(values[13]) ? values[13] : 0,
    };
  }

  if (matrixValue.startsWith("matrix(") && values.length >= 6) {
    return {
      scale: Number.isFinite(values[0]) ? values[0] : 1,
      x: Number.isFinite(values[4]) ? values[4] : 0,
      y: Number.isFinite(values[5]) ? values[5] : 0,
    };
  }

  return { scale: 1, x: 0, y: 0 };
};

const formatTransformMatrix = (scale = 1, x = 0, y = 0) => {
  const roundedScale = Number.isFinite(scale) ? Number(scale.toFixed(4)) : 1;
  const roundedX = Number.isFinite(x) ? Number(x.toFixed(2)) : 0;
  const roundedY = Number.isFinite(y) ? Number(y.toFixed(2)) : 0;

  return `matrix(${roundedScale}, 0, 0, ${roundedScale}, ${roundedX}, ${roundedY})`;
};

const getPointerPagePosition = (event) => {
  if (event?.targetTouches?.length === 1) {
    return {
      pageX: event.targetTouches[0].pageX,
      pageY: event.targetTouches[0].pageY,
    };
  }

  if (typeof event?.pageX === "number" && typeof event?.pageY === "number") {
    return {
      pageX: event.pageX,
      pageY: event.pageY,
    };
  }

  return null;
};

const collectStructureTokens = (nodes = [], parentId = "root", result = []) => {
  (nodes || []).forEach((node) => {
    result.push(`${parentId}:${node.id}`);
    collectStructureTokens(node.organisations || [], node.id, result);
  });

  return result;
};

const ChartContainer = forwardRef(
  (
    {
      data,
      update,
      zoom,
      zoomoutLimit,
      zoominLimit,
      containerClass,
      chartClass,
      draggable,
      collapsible,
      multipleSelect,
      onClickNode,
      onClickChart,
      sendDataUp,
      onContextMenu,
      onCloseContextMenu,
      onOpenDocument,
      contentEditable,
      onAddInitNode,
      onPasteNodeAtPosition,
      canPasteAtPosition,
    },
    ref
  ) => {
    const container = useRef();
    const chart = useRef();
    const paper = useRef();
    const topNode = useRef();
    const dataRef = useRef(data);
    const lastFreeLayoutAutoFitSignature = useRef(null);

    const [startX, setStartX] = useState(0);
    const [startY, setStartY] = useState(0);
    const [transform, setTransform] = useState("");
    const [chartTransform, setChartTransform] = useState("");
    const [enablePan, setEnablePan] = useState(true);
    const [panning, setPanning] = useState(false);
    const [potentialPan, setPotentialPan] = useState(false);
    const [potentialStartX, setPotentialStartX] = useState(0);
    const [potentialStartY, setPotentialStartY] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [sizeWarning, setSizeWarning] = useState(false);

    const node = useMemo(
      () => ({
        id: "n-root",
        name: "TOP LEVEL",
        layout: { style: "root" },
        organisations: JSON.parse(JSON.stringify(data.organisations || [])),
      }),
      [data.organisations]
    );
    const isFreeLayout = data?.document?.layoutMode === "free";
    const isEmptyChart = (node.organisations || []).length === 0;
    const freeLayoutAutoFitSignature = useMemo(
      () =>
        JSON.stringify({
          layoutMode: data?.document?.layoutMode || "",
          paperOrientation: data?.document?.paperOrientation || "",
          paperSize: data?.document?.paperSize || "",
          nodes: collectStructureTokens(data?.organisations || []),
          freeConnections: (data?.document?.freeConnections || [])
            .map((connection) => connection.id)
            .sort(),
        }),
      [
        data?.document?.freeConnections,
        data?.document?.layoutMode,
        data?.document?.paperOrientation,
        data?.document?.paperSize,
        data?.organisations,
      ]
    );
    const customFontFaceCss = buildCustomFontFaceCss(data?.settings?.customFonts || []);
    const paperBackgroundColor = data?.document?.paperBackgroundColor || "#f8f9fa";
    const paperTransform = isFreeLayout ? undefined : transform;
    const effectiveChartTransform = isFreeLayout ? transform : chartTransform;

    const createDigger = () => {
      return new JSONDigger(
        {
          id: "n-root",
          name: "TOP LEVEL",
          layout: { style: "root" },
          organisations: JSON.parse(JSON.stringify(dataRef.current.organisations || [])),
        },
        "id",
        "organisations"
      );
    };

    const buildNextData = (rootNode, documentPatch = null) => {
      return {
        ...dataRef.current,
        ...(documentPatch !== null
          ? {
              document: {
                ...(dataRef.current.document || {}),
                ...documentPatch,
              },
            }
          : {}),
        organisations: [...(rootNode.organisations || [])],
      };
    };

    useEffect(() => {
      dataRef.current = data;
    }, [data]);

    useEffect(() => {
      if (isFreeLayout) {
        return undefined;
      }

      const timer = setTimeout(() => {
        resetViewWhenReady();
      }, 50);

      return () => {
        clearTimeout(timer);
      };
    }, []);

    useEffect(() => {
      const timer = setTimeout(() => {
        resetViewWhenReady();
      }, 50);

      return () => {
        clearTimeout(timer);
      };
    }, [update, data, isFreeLayout]);

    useEffect(() => {
      if (!isFreeLayout) {
        lastFreeLayoutAutoFitSignature.current = null;
        return undefined;
      }

      if (freeLayoutAutoFitSignature === lastFreeLayoutAutoFitSignature.current) {
        return undefined;
      }

      lastFreeLayoutAutoFitSignature.current = freeLayoutAutoFitSignature;

      const timer = setTimeout(() => {
        resetViewWhenReady();
      }, 50);

      return () => {
        clearTimeout(timer);
      };
    }, [freeLayoutAutoFitSignature, isFreeLayout]);

    const resetViewWhenReady = (attempt = 0) => {
      if (!chart.current) {
        return;
      }

      const paperElement = chart.current.querySelector("#paper");
      const containerWidth = chart.current.clientWidth;
      const containerHeight = chart.current.clientHeight;
      const paperWidth = paperElement?.clientWidth || 0;
      const paperHeight = paperElement?.clientHeight || 0;

      if (containerWidth && containerHeight && paperWidth && paperHeight) {
        updateChartHandler();
        resetViewHandler();
        return;
      }

      if (attempt < 8) {
        setTimeout(() => {
          resetViewWhenReady(attempt + 1);
        }, 50);
      }
    };

    useEffect(() => {
      setChartTransform("");
      resetViewWhenReady();
    }, [
      data?.document?.paperSize,
      data?.document?.paperOrientation,
      data?.document?.layoutMode,
    ]);

    useEffect(() => {
      if ((data?.organisations || []).length > 0) {
        return undefined;
      }

      setChartTransform("");

      const timer = setTimeout(() => {
        resetViewWhenReady();
      }, 50);

      return () => {
        clearTimeout(timer);
      };
    }, [
      data?.organisations,
      data?.document?.layoutMode,
      data?.document?.paperSize,
      data?.document?.paperOrientation,
    ]);

    useEffect(() => {
      if (!chart.current || typeof ResizeObserver === "undefined") {
        return undefined;
      }

      if (isFreeLayout) {
        return undefined;
      }

      const observedElements = [
        chart.current,
        chart.current.querySelector("#paper"),
        chart.current.querySelector(".chart-container"),
        chart.current.querySelector(".chart"),
      ].filter(Boolean);

      let frameId = null;
      const observer = new ResizeObserver(() => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }

        frameId = window.requestAnimationFrame(() => {
          resetViewWhenReady();
        });
      });

      observedElements.forEach((element) => observer.observe(element));

      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }
        observer.disconnect();
      };
    }, [
      data?.organisations,
      data?.document?.layoutMode,
      data?.document?.paperOrientation,
      data?.document?.paperSize,
      isFreeLayout,
    ]);

    const changeHierarchy = async (draggedItemData, dropTargetId) => {
      const dsDigger = createDigger();
      await dsDigger.removeNode(draggedItemData.id);
      await dsDigger.addChildren(dropTargetId, draggedItemData);
      sendDataUp(buildNextData(dsDigger.ds));
    };

    const updateNodeLayout = async (nodeId, layoutPatch) => {
      const dsDigger = createDigger();
      const currentNode = await dsDigger.findNodeById(nodeId);
      await dsDigger.updateNode({
        ...currentNode,
        layout: {
          ...(currentNode.layout || {}),
          ...layoutPatch,
        },
      });

      sendDataUp(buildNextData(dsDigger.ds));
    };

    const updateFreeConnections = async (nextConnectionsOrUpdater) => {
      const dsDigger = createDigger();
      const currentConnections = Array.isArray(dataRef.current?.document?.freeConnections)
        ? dataRef.current.document.freeConnections
        : [];
      const nextConnections =
        typeof nextConnectionsOrUpdater === "function"
          ? nextConnectionsOrUpdater(currentConnections)
          : nextConnectionsOrUpdater;

      sendDataUp(buildNextData(dsDigger.ds, { freeConnections: nextConnections }));
    };

    const createFreeLayoutNode = async ({ position, connectionDraft, kind } = {}) => {
      const dsDigger = createDigger();
      const nextNodeLayout = {
        style: "default",
        positionMode: "manual",
        x: Math.round(position?.x || 0),
        y: Math.round(position?.y || 0),
      };
      const nextNode =
        kind === "note"
          ? createNoteNode({ layout: nextNodeLayout })
          : createExampleOrganisation({ layout: nextNodeLayout });

      dsDigger.addTopLevelNode(nextNode);

      const currentConnections = Array.isArray(dataRef.current?.document?.freeConnections)
        ? dataRef.current.document.freeConnections
        : [];
      let nextConnections = currentConnections;

      if (connectionDraft?.sourceNodeId && connectionDraft?.sourceAnchor) {
        if (
          connectionDraft.editingConnectionType === "free" &&
          connectionDraft.editingConnectionId &&
          ["source", "target"].includes(connectionDraft.editingRole)
        ) {
          nextConnections = currentConnections.map((connection) => {
            if (connection.id !== connectionDraft.editingConnectionId) {
              return connection;
            }

            return connectionDraft.editingRole === "source"
              ? {
                  ...connection,
                  sourceNodeId: nextNode.id,
                  sourceAnchor: connectionDraft.targetAnchor,
                }
              : {
                  ...connection,
                  targetNodeId: nextNode.id,
                  targetAnchor: connectionDraft.targetAnchor,
                };
          });
        } else {
          const pairKey = [connectionDraft.sourceNodeId, nextNode.id].sort().join("::");
          nextConnections = currentConnections.filter(
            (connection) =>
              [connection.sourceNodeId, connection.targetNodeId].sort().join("::") !== pairKey
          );
          nextConnections.push({
            id: `free-connection-${pairKey}`,
            sourceNodeId: connectionDraft.sourceNodeId,
            targetNodeId: nextNode.id,
            sourceAnchor: connectionDraft.sourceAnchor,
            targetAnchor: connectionDraft.targetAnchor,
          });
        }
      }

      sendDataUp(buildNextData(dsDigger.ds, { freeConnections: nextConnections }));

      return nextNode;
    };

    const clickChartHandler = (event) => {
      if (!event.target.closest(".oc-node")) {
        if (onClickChart) {
          onClickChart();
        }
        selectNodeService.clearSelectedNodeInfo();
        onCloseContextMenu();
      }
    };

    const onDragNode = (e) => {
      setDragging(e);
      setEnablePan(!e);
      onCloseContextMenu();
    };

    const panEndHandler = () => {
      setPanning(false);
      setPotentialPan(false);
    };

    const panHandler = (e) => {
      const pointer = getPointerPagePosition(e);

      if (!pointer) {
        return;
      }

      const { pageX, pageY } = pointer;

      // If we only have a potential pan (mouse pressed but not moved enough), check threshold
      if (!panning && potentialPan) {
        const dx = Math.abs(pageX - potentialStartX);
        const dy = Math.abs(pageY - potentialStartY);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) {
          // do not start panning yet
          return;
        }
        // start panning now
        setPanning(true);
        setPotentialPan(false);
      }

      if (!panning) return;

      const currentTransform = parseTransformMatrix(transform);
      const newX = pageX - startX;
      const newY = pageY - startY;

      setTransform(formatTransformMatrix(currentTransform.scale, newX, newY));
    };

    const panStartHandler = (e) => {
      onCloseContextMenu();
      if (e.target.closest(".oc-node")) {
        setPanning(false);
        setPotentialPan(false);
        return;
      }

      const pointer = getPointerPagePosition(e);
      if (!pointer) {
        return;
      }

      const { x: lastX, y: lastY } = parseTransformMatrix(transform);

      // mark potential pan; actual panning will start after small mouse movement
      setPotentialStartX(pointer.pageX);
      setPotentialStartY(pointer.pageY);
      setStartX(pointer.pageX - lastX);
      setStartY(pointer.pageY - lastY);
      setPotentialPan(true);
    };

    const updateViewScale = (newScale) => {
      const currentTransform = parseTransformMatrix(transform);
      const targetScale = Math.abs(currentTransform.scale * newScale);

      if (targetScale > zoomoutLimit && targetScale < zoominLimit) {
        setTransform(
          formatTransformMatrix(targetScale, currentTransform.x, currentTransform.y)
        );
      }
    };

    const getChartMetrics = () => {
      if (!chart.current) {
        return null;
      }

      const paperElement = chart.current.querySelector("#paper");
      const chartContainerElement = chart.current.querySelector(".chart-container");
      const chartElement = chart.current.querySelector(".chart");
      const rootNodeElement = chart.current.querySelector("#n-root");

      if (!paperElement || !chartContainerElement || !chartElement) {
        return null;
      }

      const paperWidth = paperElement.clientWidth;
      const paperHeight = paperElement.clientHeight;
      const chartWidth = chartElement.clientWidth;
      const chartHeight = chartElement.clientHeight;
      const chartContainerWidth = chartContainerElement.clientWidth;
      const chartContainerHeight = chartContainerElement.clientHeight;

      if (
        !paperWidth ||
        !paperHeight ||
        !chartWidth ||
        !chartHeight ||
        !chartContainerWidth ||
        !chartContainerHeight
      ) {
        return null;
      }

      let rootOffsetTop = 0;
      if (rootNodeElement) {
        const chartRect = chartElement.getBoundingClientRect();
        const rootRect = rootNodeElement.getBoundingClientRect();
        const currentChartScale = parseTransformMatrix(chartTransform).scale || 1;
        rootOffsetTop = (rootRect.top - chartRect.top) / currentChartScale;
      }

      return {
        paperWidth,
        paperHeight,
        chartWidth,
        chartHeight,
        chartContainerWidth,
        chartContainerHeight,
        rootOffsetTop,
      };
    };

    const getFreeLayoutBounds = () => {
      if (!chart.current) {
        return null;
      }

      const freeLayoutItems = Array.from(
        chart.current.querySelectorAll(".free-layout-item")
      );

      if (freeLayoutItems.length === 0) {
        return null;
      }

      let minLeft = Number.POSITIVE_INFINITY;
      let minTop = Number.POSITIVE_INFINITY;
      let maxRight = Number.NEGATIVE_INFINITY;
      let maxBottom = Number.NEGATIVE_INFINITY;

      freeLayoutItems.forEach((item) => {
        const width = item.offsetWidth;
        const height = item.offsetHeight;

        if (!width && !height) {
          return;
        }

        minLeft = Math.min(minLeft, item.offsetLeft);
        minTop = Math.min(minTop, item.offsetTop);
        maxRight = Math.max(maxRight, item.offsetLeft + width);
        maxBottom = Math.max(maxBottom, item.offsetTop + height);
      });

      if (
        !Number.isFinite(minLeft) ||
        !Number.isFinite(minTop) ||
        !Number.isFinite(maxRight) ||
        !Number.isFinite(maxBottom)
      ) {
        return null;
      }

      return {
        left: minLeft,
        top: minTop,
        width: Math.max(1, maxRight - minLeft),
        height: Math.max(1, maxBottom - minTop),
      };
    };

    const resetViewHandler = () => {
      if (!chart.current) {
        return;
      }

      const paperElement = chart.current.querySelector("#paper");
      if (!paperElement) {
        return;
      }

      const containerWidth = chart.current.clientWidth;
      const containerHeight = chart.current.clientHeight;
      const chartWidth = paperElement.clientWidth;
      const chartHeight = paperElement.clientHeight;

      if (!containerWidth || !containerHeight || !chartWidth || !chartHeight) {
        return;
      }

      if (isFreeLayout) {
        const freeLayoutBounds = getFreeLayoutBounds();

        if (!freeLayoutBounds) {
          setTransform(formatTransformMatrix(1, 0, 0));
          return;
        }

        let newScale = Math.min(
          (containerWidth - VIEWPORT_MARGIN) / freeLayoutBounds.width,
          (containerHeight - VIEWPORT_MARGIN) / freeLayoutBounds.height
        );

        if (!Number.isFinite(newScale) || newScale <= 0) {
          newScale = 1;
        }

        newScale = Math.min(1, newScale);

        const translateX =
          (containerWidth - freeLayoutBounds.width * newScale) / 2 -
          freeLayoutBounds.left * newScale;
        const translateY =
          (containerHeight - freeLayoutBounds.height * newScale) / 2 -
          freeLayoutBounds.top * newScale;

        setTransform(formatTransformMatrix(newScale, translateX, translateY));
        return;
      }

      let newScale = Math.min(
        (containerWidth - VIEWPORT_MARGIN) / chartWidth,
        (containerHeight - VIEWPORT_MARGIN) / chartHeight
      );

      if (!Number.isFinite(newScale) || newScale <= 0) {
        newScale = 1;
      }

      newScale = Math.min(1, newScale);

      const translateX = (containerWidth - chartWidth * newScale) / 2;
      const translateY = (containerHeight - chartHeight * newScale) / 2;

      setTransform(formatTransformMatrix(newScale, translateX, translateY));
    };

    const zoomHandler = (e) => {
      let newScale = 1 + (e.deltaY > 0 ? -0.01 : 0.01);
      updateViewScale(newScale);
    };
    const zoomInHandler = (e) => {
      let newScale = 1 + 0.2;
      updateViewScale(newScale);
    };
    const zoomOutHandler = (e) => {
      let newScale = 1 - 0.2;
      updateViewScale(newScale);
    };

    const updateChartHandler = () => {
      if (isFreeLayout) {
        setChartTransform("");
        return;
      }

      const metrics = getChartMetrics();
      if (!metrics) {
        return;
      }

      const availableWidth = Math.max(metrics.paperWidth - VIEWPORT_MARGIN, 0);
      const availableHeight = Math.max(metrics.chartContainerHeight - VIEWPORT_MARGIN, 0);
      const contentHeight = Math.max(
        metrics.chartHeight - metrics.rootOffsetTop,
        1
      );

      let newScale = Math.min(
        availableWidth / metrics.chartWidth,
        availableHeight / contentHeight
      );

      if (!Number.isFinite(newScale) || newScale <= 0) {
        newScale = 1;
      }

      newScale = Math.max(0.3, Math.min(1, newScale));
      setSizeWarning(newScale < 1);

      const translateX = (metrics.paperWidth - metrics.chartWidth * newScale) / 2;
      const translateY = ROOT_NODE_TOP_MARGIN - metrics.rootOffsetTop * newScale;

      setChartTransform(formatTransformMatrix(newScale, translateX, translateY));
    };

    const exportSVG = async (node, exportFilename, userView) => {
      // resetViewHandler();
      setTimeout(() => {
        toSvg(node).then(function (dataUrl) {
          download(dataUrl, exportFilename, "svg");
          resetChart({
            node,
            userView,
          });
        });
      }, 1000);
    };

    const exportPDF = (node, exportFilename, userView) => {
      const boundingClientRect = node.getBoundingClientRect();
      const canvasWidth = Math.floor(boundingClientRect.width);
      const canvasHeight = Math.floor(boundingClientRect.height);

      toJpeg(node, { quality: 1, pixelRatio: 3 }).then(
        function (dataUrl) {
          const doc = new jsPDF({
            orientation: data.document.paperOrientation,
            unit: "px",
            format: [canvasWidth, canvasHeight],
          });
          doc.addImage(dataUrl, "JPEG", 0, 0, canvasWidth, canvasHeight);
          doc.save(exportFilename + ".pdf");

          resetChart({
            node,
            userView,
          });
        },
        // on error
        () => {
          resetChart({
            node,
            userView,
          });
        }
      );
    };

    const download = (href, exportFilename, exportFileExtension) => {
      const link = document.createElement("a");
      link.href = href;
      link.download = exportFilename + "." + exportFileExtension;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const resetChart = ({ node, userView }) => {
      node.style.background = userView.nodeBackground;
      node.style.transform = userView.nodeTransform;
      node.style.overflow = userView.nodeOverflow;
      container.current.scrollLeft = userView.originalScrollLeft;
      container.current.scrollTop = userView.originalScrollTop;

      const logo = node.querySelector("#logo");
      if (logo) {
        logo.style.display = "block";
      }

      setExporting(false);
    };

    const exportPNG = (node, exportFilename, userView) => {
      const isWebkit = "WebkitAppearance" in document.documentElement.style;
      const isFf = !!window.sidebar;
      const isEdge =
        navigator.appName === "Microsoft Internet Explorer" ||
        (navigator.appName === "Netscape" &&
          navigator.appVersion.indexOf("Edge") > -1);

      // for old browser and not pdf export
      if ((!isWebkit && !isFf) || isEdge) {
        toBlob(node).then(
          function (blob) {
            window.navigator.msSaveBlob(blob, exportFilename + ".png");
            resetChart({
              node,
              userView,
            });
          }, // on error
          () => {
            resetChart({
              node,
              userView,
            });
          }
        );
      } else {
        //
        toPng(node, { quality: 1, pixelRatio: 3 }).then(
          function (dataUrl) {
            download(dataUrl, exportFilename, "png");
            resetChart({
              node,
              userView,
            });
          },
          // on error
          () => {
            resetChart({
              node,
              userView,
            });
          }
        );
      }
    };

    useImperativeHandle(ref, () => ({
      exportTo: (fileName, fileextension, includeLogo, data, pdfType, options = {}) => {
        setExporting(true);

        selectNodeService.clearSelectedNodeInfo();
        const exportFilename = fileName || "OrgChart";
        const exportFileExtension = fileextension || "png";
        const useCurrentView = Boolean(options?.useCurrentView);

        const originalScrollLeft = container.current.scrollLeft;
        container.current.scrollLeft = 0;
        const originalScrollTop = container.current.scrollTop;
        container.current.scrollTop = 0;
        const canvas = chart.current.querySelector("#paper");
        if (!includeLogo && data.document.logo) {
          const logo = canvas.querySelector("#logo");
          if (logo) {
            logo.style.display = "none";
          }
        }

        const node = useCurrentView ? chart.current : chart.current.querySelector("#paper");
        const userView = {
          originalScrollLeft: originalScrollLeft,
          originalScrollTop: originalScrollTop,
          nodeBackground: node.style.background,
          nodeTransform: node.style.transform,
          nodeOverflow: node.style.overflow,
        };

        if (useCurrentView) {
          node.style.background = data?.document?.paperBackgroundColor || "#fff";
          node.style.overflow = "hidden";
        } else if (
          exportFileExtension === "svg" ||
          exportFileExtension === "pdf" ||
          exportFileExtension === "png"
        ) {
          node.style.background = data?.document?.paperBackgroundColor || "#fff";
          node.style.transform = "";
          node.style.scrollLeft = 0;
          node.style.scrollTop = 0;
        }

        if (exportFileExtension === "svg") {
          exportSVG(node, exportFilename, userView, false).then(() => {
            setExporting(false);
          });
        } else if (exportFileExtension === "rdf") {
          exportRDF(data);
          setExporting(false);
        } else if (exportFileExtension === "pdf") {
          exportPDF(node, exportFilename, userView);
        } else if (exportFileExtension === "png") {
          exportPNG(node, exportFilename, userView, exportFileExtension);
        }
      },
      resetViewHandler: () => {
        resetViewHandler();
      },
      demoDragMode: (enable, nodeId = "") => {
        topNode.current.demoDragMode(enable, nodeId);
      },
    }));

    return (
      <>
        <div
          ref={container}
          className={
            "view-container " +
            containerClass +
            (dragging ? " dragging" : "") +
            (panning ? " panning" : "") +
            (exporting ? "exporting" : "")
          }
          onWheel={zoom ? zoomHandler : undefined}
          onMouseUp={panning || potentialPan ? panEndHandler : undefined}
          onMouseLeave={panning || potentialPan ? panEndHandler : undefined}
        >
          <div className="navigation-container">
            <ButtonGroup aria-label="navigation" vertical>
              <Button onClick={zoomInHandler} title="Herein zoomen">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  className="bi bi-zoom-in"
                  viewBox="0 0 16 16"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM13 6.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z"
                  />
                  <path d="M10.344 11.742c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1 6.538 6.538 0 0 1-1.398 1.4z" />
                  <path
                    fillRule="evenodd"
                    d="M6.5 3a.5.5 0 0 1 .5.5V6h2.5a.5.5 0 0 1 0 1H7v2.5a.5.5 0 0 1-1 0V7H3.5a.5.5 0 0 1 0-1H6V3.5a.5.5 0 0 1 .5-.5z"
                  />
                </svg>
              </Button>
              <Button onClick={zoomOutHandler} title="Heraus zoomen">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  className="bi bi-zoom-out"
                  viewBox="0 0 16 16"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM13 6.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z"
                  />
                  <path d="M10.344 11.742c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1 6.538 6.538 0 0 1-1.398 1.4z" />
                  <path
                    fillRule="evenodd"
                    d="M3 6.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"
                  />
                </svg>
              </Button>

              <Button onClick={resetViewHandler} title="Übersicht">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  className="bi bi-arrows-fullscreen"
                  viewBox="0 0 16 16"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344 0a.5.5 0 0 1 .707 0l4.096 4.096V11.5a.5.5 0 1 1 1 0v3.975a.5.5 0 0 1-.5.5H11.5a.5.5 0 0 1 0-1h2.768l-4.096-4.096a.5.5 0 0 1 0-.707zm0-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707zm-4.344 0a.5.5 0 0 1-.707 0L1.025 1.732V4.5a.5.5 0 0 1-1 0V.525a.5.5 0 0 1 .5-.5H4.5a.5.5 0 0 1 0 1H1.732l4.096 4.096a.5.5 0 0 1 0 .707z"
                  />
                </svg>
              </Button>
            </ButtonGroup>
          </div>

          <div
            ref={chart}
            className={"editor " + chartClass + (exporting ? " exporting" : "")}
            onClick={clickChartHandler}
            onMouseDown={enablePan ? panStartHandler : undefined}
            onMouseMove={enablePan && (panning || potentialPan) ? panHandler : undefined}
            onMouseUp={panning || potentialPan ? panEndHandler : undefined}
          >
            {customFontFaceCss && <style>{customFontFaceCss}</style>}
            <div
              id="paper"
              ref={paper}
              className={`paper ${data.document.paperSize} ${data.document.paperOrientation}${
                isFreeLayout ? " free-layout-paper" : ""
              }`}
              style={{
                transform: paperTransform,
                "--paper-background-color": paperBackgroundColor,
              }}
            >
              {data.document && (
                <div className="title-container">
                  <div className="cell">
                    {contentEditable && (
                      <Button
                        className="btn-sm btn-edit btn-secondary btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDocument(true);
                        }}
                      >
                        Bearbeiten
                      </Button>
                    )}
                    {data.document.logo && (
                      <img
                        id="logo"
                        alt="logo"
                        style={{ height: "5rem", width: "auto" }}
                        src={data.document.logo}
                      />
                    )}

                    {data.document.title && (
                      <div
                        className="title-content"
                        style={{
                          fontFamily: data?.document?.titleFontFamily || undefined,
                        }}
                      >
                        <h1>{data.document.title}</h1>
                        {data.document.creator && (
                          <span>{data.document.creator}</span>
                        )}
                        {data.document.version && (
                          <span> {formatDate(data.document.version)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="chart-container">
                <div className="chart" style={{ transform: effectiveChartTransform }}>
                  {isFreeLayout ? (
                    <FreeLayoutCanvas
                      nodes={node.organisations}
                      freeConnections={data?.document?.freeConnections || []}
                      contentEditable={contentEditable}
                      onClickNode={onClickNode}
                      onContextMenu={onContextMenu}
                      onCloseContextMenu={onCloseContextMenu}
                      onUpdateNodeLayout={updateNodeLayout}
                      onUpdateFreeConnections={updateFreeConnections}
                      onCreateNodeAtPosition={createFreeLayoutNode}
                      onPasteNodeAtPosition={onPasteNodeAtPosition}
                      canPasteAtPosition={canPasteAtPosition}
                    />
                  ) : isEmptyChart ? (
                    <div className="empty-chart-state">
                      <div className="empty-chart-card">
                        <h2>Neues Organigramm</h2>
                        <p>
                          Dieses Dokument ist noch leer. Legen Sie die erste Organisation an,
                          um das Organigramm zu starten.
                        </p>
                        {isFreeLayout && (
                          <p>
                            Auch im flexiblen Modus startet das Organigramm mit einer ersten
                            Karte.
                          </p>
                        )}
                        {contentEditable && (
                          <Button type="button" variant="success" onClick={() => onAddInitNode()}>
                            Neue Organisation anlegen
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <ul>
                      <ChartNode
                        ref={topNode}
                        data={node}
                        level={0}
                        index={0}
                        update={update}
                        draggable={draggable}
                        collapsible={collapsible}
                        multipleSelect={multipleSelect}
                        changeHierarchy={changeHierarchy}
                        onClickNode={onClickNode}
                        onContextMenu={onContextMenu}
                        onDragNode={onDragNode}
                        onAddInitNode={onAddInitNode}
                        contentEditable={contentEditable}
                      />
                    </ul>
                  )}
                </div>
              </div>
              {data.document.note && (
                <div className="note-container">
                  <div className="cell">
                    {contentEditable && (
                      <Button
                        className="btn-sm btn-edit btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDocument(true);
                        }}
                      >
                        Bearbeiten
                      </Button>
                    )}
                    <MDEditor.Markdown
                      source={data.document.note}
                      rehypePlugins={[[rehypeSanitize,customSchema]]}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={`oc-mask ${exporting ? "" : "hidden"}`}>
          <i className="oci oci-spinner spinner"></i>
        </div>
      </>
    );
  }
);

ChartContainer.propTypes = propTypes;
ChartContainer.defaultProps = defaultProps;

export default ChartContainer;
