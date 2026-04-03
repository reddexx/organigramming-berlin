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
    const isEmptyTreeChart = !isFreeLayout && (node.organisations || []).length === 0;
    const customFontFaceCss = buildCustomFontFaceCss(data?.settings?.customFonts || []);

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
      resetViewHandler();
      setTimeout(() => {
        updateChartHandler();
      }, 50);
    }, []);

    useEffect(() => {
      setTimeout(() => {
        updateChartHandler();
      }, 50);

    }, [update, data]);

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
        x: Math.max(0, Math.round(position?.x || 0)),
        y: Math.max(0, Math.round(position?.y || 0)),
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
      // support touch and mouse
      let pageX = 0;
      let pageY = 0;
      if (!e.targetTouches) {
        pageX = e.pageX;
        pageY = e.pageY;
      } else if (e.targetTouches.length === 1) {
        pageX = e.targetTouches[0].pageX;
        pageY = e.targetTouches[0].pageY;
      } else if (e.targetTouches && e.targetTouches.length > 1) {
        return;
      }

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

      let newX = 0;
      let newY = 0;
      if (!e.targetTouches) {
        newX = pageX - startX;
        newY = pageY - startY;
      } else {
        newX = pageX - startX;
        newY = pageY - startY;
      }

      if (transform === "") {
        if (transform.indexOf("3d") === -1) {
          setTransform("matrix(1,0,0,1," + newX + "," + newY + ")");
        } else {
          setTransform(
            "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0," + newX + ", " + newY + ",0,1)"
          );
        }
      } else {
        let matrix = transform.split(",");
        if (transform.indexOf("3d") === -1) {
          matrix[4] = newX;
          matrix[5] = newY + ")";
        } else {
          matrix[12] = newX;
          matrix[13] = newY;
        }
        setTransform(matrix.join(","));
      }
    };

    const panStartHandler = (e) => {
      onCloseContextMenu();
      if (e.target.closest(".oc-node")) {
        setPanning(false);
        setPotentialPan(false);
        return;
      }

      let lastX = 0;
      let lastY = 0;
      if (transform !== "") {
        let matrix = transform.split(",");
        if (transform.indexOf("3d") === -1) {
          lastX = parseInt(matrix[4]);
          lastY = parseInt(matrix[5]);
        } else {
          lastX = parseInt(matrix[12]);
          lastY = parseInt(matrix[13]);
        }
      }

      // mark potential pan; actual panning will start after small mouse movement
      if (!e.targetTouches) {
        setPotentialStartX(e.pageX);
        setPotentialStartY(e.pageY);
      } else if (e.targetTouches.length === 1) {
        setPotentialStartX(e.targetTouches[0].pageX);
        setPotentialStartY(e.targetTouches[0].pageY);
      }
      setStartX(lastX ? (e.pageX ? e.pageX - lastX : 0) : 0);
      setStartY(lastY ? (e.pageY ? e.pageY - lastY : 0) : 0);
      setPotentialPan(true);
    };

    const updateViewScale = (newScale) => {
      let matrix = [];
      let targetScale = 1;
      if (transform === "") {
        setTransform("matrix(" + newScale + ", 0, 0, " + newScale + ", 0, 0)");
      } else {
        matrix = transform.split(",");
        if (transform.indexOf("3d") === -1) {
          targetScale = Math.abs(window.parseFloat(matrix[3]) * newScale);
          if (targetScale > zoomoutLimit && targetScale < zoominLimit) {
            matrix[0] = "matrix(" + targetScale;
            matrix[3] = targetScale;
            setTransform(matrix.join(","));
          }
        } else {
          targetScale = Math.abs(window.parseFloat(matrix[5]) * newScale);
          if (targetScale > zoomoutLimit && targetScale < zoominLimit) {
            matrix[0] = "matrix3d(" + targetScale;
            matrix[5] = targetScale;
            setTransform(matrix.join(","));
          }
        }
      }
    };

    const resetViewHandler = () => {
      if (!chart.current) {
        return;
      }

      const paperElement = chart.current.querySelector("#paper");
      if (!paperElement) {
        return;
      }

      const containerWidth = chart.current.clientWidth,
        containerHeight = chart.current.clientHeight,
        chartWidth = paperElement.clientWidth,
        chartHeight = paperElement.clientHeight;

      if (!containerWidth || !containerHeight || !chartWidth || !chartHeight) {
        return;
      }

      let newScale = Math.min(
        (containerWidth - 32) / chartWidth,
        (containerHeight - 32) / chartHeight
      );

      newScale = newScale - 0.03;

      setTransform(
        "matrix(" +
          newScale +
          ", 0, 0, " +
          newScale +
          ", " +
          (containerWidth - chartWidth) / 2 +
          ", " +
          (containerHeight - chartHeight * (1.98 - newScale)) / 2 +
          ")"
      );
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
      const rootNode = chart.current.querySelector("#n-root");
      let rootNodeHeight = 57;
      if (!chart.current) {
        return;
      }

      if (rootNode) {
        rootNodeHeight = rootNode.clientHeight;
      }

      const chartContainerElement = chart.current.querySelector(".chart-container");
      const chartElement = chart.current.querySelector(".chart");

      if (!chartContainerElement || !chartElement) {
        return;
      }

      const paperWidth = chartContainerElement.clientWidth,
        paperHeight = chartContainerElement.clientHeight,
        chartWidth = chartElement.clientWidth,
        chartHeight = chartElement.clientHeight;

      if (!paperWidth || !paperHeight || !chartWidth || !chartHeight) {
        return;
      }

      let newScale = Math.min(
        paperWidth / chartWidth,
        paperHeight / (chartHeight - rootNodeHeight)
      );

      //Minimum Scale
      if (newScale < 0.75) {
        newScale = 0.75;
        setSizeWarning(true);
      } else if (newScale > 1.2) {
        //Maximum Scale
        newScale = 1.2;
        setSizeWarning(false);
      } else {
        setSizeWarning(false);
      }

      setChartTransform(
        "matrix(" +
          newScale +
          ", 0, 0, " +
          newScale +
          ", " +
          (paperWidth - chartWidth) / 2 +
          ", " +
          (paperHeight - chartHeight - rootNodeHeight) / 2 +
          ")"
      );
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
      exportTo: (fileName, fileextension, includeLogo, data, pdfType) => {
        setExporting(true);

        selectNodeService.clearSelectedNodeInfo();
        const exportFilename = fileName || "OrgChart";
        const exportFileExtension = fileextension || "png";

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

        const node = chart.current.querySelector("#paper");
        const userView = {
          originalScrollLeft: originalScrollLeft,
          originalScrollTop: originalScrollTop,
          nodeBackground: node.style.background,
          nodeTransform: node.style.transform,
        };

        if (
          exportFileExtension === "svg" ||
          exportFileExtension === "pdf" ||
          exportFileExtension === "png"
        ) {
          node.style.background = "#fff";
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
              style={{ transform: transform }}
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
                <div className="chart" style={{ transform: chartTransform }}>
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
                  ) : isEmptyTreeChart ? (
                    <div className="empty-chart-state">
                      <div className="empty-chart-card">
                        <h2>Neues Organigramm</h2>
                        <p>
                          Dieses Dokument ist noch leer. Legen Sie die erste Organisation an,
                          um das Organigramm zu starten.
                        </p>
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
