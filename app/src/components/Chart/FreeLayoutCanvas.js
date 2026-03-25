import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";

import { selectNodeService } from "../../services/service";
import ChartNodeCard from "./ChartNodeCard";

const propTypes = {
  nodes: PropTypes.array,
  contentEditable: PropTypes.bool,
  onClickNode: PropTypes.func,
  onContextMenu: PropTypes.func,
  onCloseContextMenu: PropTypes.func,
  onUpdateNodeLayout: PropTypes.func.isRequired,
};

const defaultProps = {
  nodes: [],
  contentEditable: true,
  onClickNode: null,
  onContextMenu: null,
  onCloseContextMenu: null,
};

const LEVEL_GAP = 220;
const SIBLING_GAP = 56;
const START_X = 80;
const START_Y = 40;
const CANVAS_PADDING = 160;
const ANCHOR_OFFSET = 24;

const flattenNodes = (nodes, parentId = null, level = 1, result = []) => {
  (nodes || []).forEach((node) => {
    result.push({ node, parentId, level });
    flattenNodes(node.organisations || [], node.id, level + 1, result);
  });

  return result;
};

const getNodeWidth = (node) => node?.layout?.nodeWidth || 224;

const getAnchorsFromRect = (rect) => ({
  top: {
    side: "top",
    x: rect.left + rect.width / 2,
    y: rect.top,
    dx: 0,
    dy: -1,
  },
  right: {
    side: "right",
    x: rect.left + rect.width,
    y: rect.top + rect.height / 2,
    dx: 1,
    dy: 0,
  },
  bottom: {
    side: "bottom",
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height,
    dx: 0,
    dy: 1,
  },
  left: {
    side: "left",
    x: rect.left,
    y: rect.top + rect.height / 2,
    dx: -1,
    dy: 0,
  },
});

const chooseAnchorPair = (parentRect, childRect) => {
  const parentCenterX = parentRect.left + parentRect.width / 2;
  const parentCenterY = parentRect.top + parentRect.height / 2;
  const childCenterX = childRect.left + childRect.width / 2;
  const childCenterY = childRect.top + childRect.height / 2;
  const deltaX = childCenterX - parentCenterX;
  const deltaY = childCenterY - parentCenterY;
  const parentAnchors = getAnchorsFromRect(parentRect);
  const childAnchors = getAnchorsFromRect(childRect);

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX >= 0
      ? { start: parentAnchors.right, end: childAnchors.left }
      : { start: parentAnchors.left, end: childAnchors.right };
  }

  return deltaY >= 0
    ? { start: parentAnchors.bottom, end: childAnchors.top }
    : { start: parentAnchors.top, end: childAnchors.bottom };
};

const createOrthogonalPath = (startAnchor, endAnchor) => {
  const startLead = {
    x: startAnchor.x + startAnchor.dx * ANCHOR_OFFSET,
    y: startAnchor.y + startAnchor.dy * ANCHOR_OFFSET,
  };
  const endLead = {
    x: endAnchor.x + endAnchor.dx * ANCHOR_OFFSET,
    y: endAnchor.y + endAnchor.dy * ANCHOR_OFFSET,
  };

  const points = [
    { x: startAnchor.x, y: startAnchor.y },
    startLead,
  ];

  const startIsHorizontal = startAnchor.dx !== 0;
  const endIsHorizontal = endAnchor.dx !== 0;

  if (startIsHorizontal && endIsHorizontal) {
    const midX = Math.round((startLead.x + endLead.x) / 2);
    points.push({ x: midX, y: startLead.y });
    points.push({ x: midX, y: endLead.y });
  } else if (!startIsHorizontal && !endIsHorizontal) {
    const midY = Math.round((startLead.y + endLead.y) / 2);
    points.push({ x: startLead.x, y: midY });
    points.push({ x: endLead.x, y: midY });
  } else {
    points.push({ x: endLead.x, y: startLead.y });
  }

  points.push(endLead);
  points.push({ x: endAnchor.x, y: endAnchor.y });

  const deduped = points.filter((point, index, allPoints) => {
    if (index === 0) {
      return true;
    }

    const previousPoint = allPoints[index - 1];
    return point.x !== previousPoint.x || point.y !== previousPoint.y;
  });

  return deduped.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
};

const buildAutoPositions = (nodes) => {
  const positions = {};
  let cursorX = START_X;

  const layoutBranch = (node, level) => {
    const children = node.organisations || [];
    const width = getNodeWidth(node);

    if (!children.length) {
      const position = { x: cursorX, y: START_Y + (level - 1) * LEVEL_GAP };
      positions[node.id] = position;
      cursorX += width + SIBLING_GAP;
      return position;
    }

    const childPositions = children.map((child) => layoutBranch(child, level + 1));
    const minX = Math.min(...childPositions.map((position) => position.x));
    const maxX = Math.max(
      ...children.map(
        (child, index) => childPositions[index].x + getNodeWidth(child)
      )
    );
    const position = {
      x: minX + (maxX - minX - width) / 2,
      y: START_Y + (level - 1) * LEVEL_GAP,
    };
    positions[node.id] = position;
    return position;
  };

  (nodes || []).forEach((node) => {
    layoutBranch(node, 1);
    cursorX += SIBLING_GAP;
  });

  return positions;
};

const FreeLayoutCanvas = ({
  nodes,
  contentEditable,
  onClickNode,
  onContextMenu,
  onCloseContextMenu,
  onUpdateNodeLayout,
}) => {
  const wrapperRef = useRef();
  const nodeRefs = useRef({});
  const dragMovedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [nodeRects, setNodeRects] = useState({});
  const [draftPositions, setDraftPositions] = useState({});
  const [dragState, setDragState] = useState(null);

  const flattenedNodes = useMemo(() => flattenNodes(nodes), [nodes]);
  const autoPositions = useMemo(() => buildAutoPositions(nodes), [nodes]);

  const getPosition = (node) => {
    if (draftPositions[node.id]) {
      return draftPositions[node.id];
    }

    if (node?.layout?.positionMode === "manual") {
      return {
        x: Number.isFinite(node.layout?.x) ? node.layout.x : autoPositions[node.id]?.x || 0,
        y: Number.isFinite(node.layout?.y) ? node.layout.y : autoPositions[node.id]?.y || 0,
      };
    }

    return autoPositions[node.id] || { x: 0, y: 0 };
  };

  useEffect(() => {
    const subscription = selectNodeService
      .getSelectedNodeInfo()
      .subscribe((selectedNodeInfo) => {
        setSelectedNodeId(selectedNodeInfo?.selectedNodeId || null);
      });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const measureNodes = () => {
      if (!wrapperRef.current) {
        return;
      }

      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const nextRects = {};

      flattenedNodes.forEach(({ node }) => {
        const element = nodeRefs.current[node.id];
        if (!element) {
          return;
        }

        const rect = element.getBoundingClientRect();
        nextRects[node.id] = {
          left: rect.left - wrapperRect.left,
          top: rect.top - wrapperRect.top,
          width: rect.width,
          height: rect.height,
        };
      });

      setNodeRects(nextRects);
    };

    const frame = window.requestAnimationFrame(measureNodes);
    window.addEventListener("resize", measureNodes);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measureNodes);
    };
  }, [flattenedNodes, draftPositions, autoPositions]);

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    document.body.classList.add("free-layout-dragging");

    const handleMouseMove = (event) => {
      event.preventDefault();

      const nextX = Math.max(
        0,
        Math.round(dragState.startPosition.x + event.clientX - dragState.startX)
      );
      const nextY = Math.max(
        0,
        Math.round(dragState.startPosition.y + event.clientY - dragState.startY)
      );

      if (
        Math.abs(event.clientX - dragState.startX) > 2 ||
        Math.abs(event.clientY - dragState.startY) > 2
      ) {
        dragMovedRef.current = true;
      }

      setDraftPositions((current) => ({
        ...current,
        [dragState.node.id]: { x: nextX, y: nextY },
      }));
    };

    const handleMouseUp = async () => {
      const nextPosition = draftPositions[dragState.node.id] || dragState.startPosition;
      setDragState(null);

      if (dragMovedRef.current) {
        suppressClickRef.current = true;
        await onUpdateNodeLayout(dragState.node.id, {
          positionMode: "manual",
          x: nextPosition.x,
          y: nextPosition.y,
        });
      }

      dragMovedRef.current = false;
      setDraftPositions((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[dragState.node.id];
        return nextDrafts;
      });
    };

    const handleWindowBlur = () => {
      setDragState(null);
      dragMovedRef.current = false;
      setDraftPositions((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[dragState.node.id];
        return nextDrafts;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.body.classList.remove("free-layout-dragging");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [dragState, draftPositions, onUpdateNodeLayout]);

  const canvasSize = useMemo(() => {
    const measuredWidths = Object.values(nodeRects).map(
      (rect) => rect.left + rect.width + CANVAS_PADDING
    );
    const measuredHeights = Object.values(nodeRects).map(
      (rect) => rect.top + rect.height + CANVAS_PADDING
    );
    const positionedWidths = flattenedNodes.map(({ node }) => {
      const position = getPosition(node);
      return position.x + getNodeWidth(node) + CANVAS_PADDING;
    });
    const positionedHeights = flattenedNodes.map(({ node }) => {
      const position = getPosition(node);
      const estimatedHeight = nodeRects[node.id]?.height || 160;
      return position.y + estimatedHeight + CANVAS_PADDING;
    });

    return {
      width: Math.max(1400, ...measuredWidths, ...positionedWidths),
      height: Math.max(900, ...measuredHeights, ...positionedHeights),
    };
  }, [flattenedNodes, nodeRects, draftPositions]);

  const connectors = flattenedNodes
    .filter(({ parentId }) => parentId)
    .map(({ node, parentId }) => {
      const childRect = nodeRects[node.id];
      const parentRect = nodeRects[parentId];

      if (!childRect || !parentRect) {
        return null;
      }

      const { start, end } = chooseAnchorPair(parentRect, childRect);

      return {
        id: `${parentId}-${node.id}`,
        d: createOrthogonalPath(start, end),
      };
    })
    .filter(Boolean);

  const handleNodeMouseDown = (event, node) => {
    if (!contentEditable || event.button !== 0) {
      return;
    }

    if (event.target.closest("button, input, textarea, select, a")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (onClickNode) {
      onClickNode(node);
    }

    if (contentEditable) {
      selectNodeService.sendSelectedNodeInfo(node.id);
    }

    onCloseContextMenu?.();
    dragMovedRef.current = false;
    setDragState({
      node,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: getPosition(node),
    });
  };

  const handleNodeClick = (node) => {
    if (dragMovedRef.current || suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (onClickNode) {
      onClickNode(node);
    }

    if (contentEditable) {
      selectNodeService.sendSelectedNodeInfo(node.id);
    }
  };

  const handleContextMenu = (event, node) => {
    event.preventDefault();

    if (onClickNode) {
      onClickNode(node);
    }

    if (contentEditable) {
      selectNodeService.sendSelectedNodeInfo(node.id);
    }

    onContextMenu?.(event);
  };

  return (
    <div
      ref={wrapperRef}
      className="free-layout-canvas"
      style={{
        width: `${canvasSize.width}px`,
        height: `${canvasSize.height}px`,
      }}
    >
      <svg className="free-layout-connectors" aria-hidden="true">
        {connectors.map((connector) => (
          <path key={connector.id} d={connector.d} />
        ))}
      </svg>
      <ul className="free-layout-list">
        {flattenedNodes.map(({ node, level }) => {
          const position = getPosition(node);
          const isDragging = dragState?.node?.id === node.id;

          return (
            <li
              key={node.id}
              className={`oc-hierarchy level-${level} free-layout-item${
                isDragging ? " dragging" : ""
              }`}
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
              }}
            >
              <div
                id={node.id}
                ref={(element) => {
                  if (element) {
                    nodeRefs.current[node.id] = element;
                  } else {
                    delete nodeRefs.current[node.id];
                  }
                }}
                className={
                  "oc-node free-layout-node" +
                  (selectedNodeId === node.id ? " selected" : "") +
                  (node.layout?.style ? ` ${node.layout.style}` : "") +
                  (isDragging ? " position-dragging" : "") +
                  (node.organisations && node.organisations.length > 0
                    ? node.organisations.length > 1
                      ? " has-children"
                      : " has-child"
                    : " end-node")
                }
                onClick={() => handleNodeClick(node)}
                onMouseDown={(event) => handleNodeMouseDown(event, node)}
                onContextMenu={(event) => handleContextMenu(event, node)}
                onDragStart={(event) => event.preventDefault()}
              >
                <ChartNodeCard data={node} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

FreeLayoutCanvas.propTypes = propTypes;
FreeLayoutCanvas.defaultProps = defaultProps;

export default FreeLayoutCanvas;