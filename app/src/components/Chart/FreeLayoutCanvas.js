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
const OBSTACLE_PADDING = 18;
const ANCHOR_SIDES = ["top", "right", "bottom", "left"];

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

const isValidAnchorSide = (side) => ANCHOR_SIDES.includes(side);

const getConnectionAnchorPair = (childNode, parentRect, childRect) => {
  const parentAnchors = getAnchorsFromRect(parentRect);
  const childAnchors = getAnchorsFromRect(childRect);
  const parentSide = childNode?.layout?.connectorParentAnchor;
  const childSide = childNode?.layout?.connectorChildAnchor;

  if (isValidAnchorSide(parentSide) && isValidAnchorSide(childSide)) {
    return {
      start: parentAnchors[parentSide],
      end: childAnchors[childSide],
      manual: true,
    };
  }

  return {
    ...chooseAnchorPair(parentRect, childRect),
    manual: false,
  };
};

const resolveConnectionSelection = (firstSelection, secondSelection, nodeMetaById) => {
  const firstMeta = nodeMetaById[firstSelection.nodeId];
  const secondMeta = nodeMetaById[secondSelection.nodeId];

  if (!firstMeta || !secondMeta || firstSelection.nodeId === secondSelection.nodeId) {
    return null;
  }

  if (firstMeta.parentId === secondSelection.nodeId) {
    return {
      childNodeId: firstSelection.nodeId,
      parentAnchor: secondSelection.side,
      childAnchor: firstSelection.side,
    };
  }

  if (secondMeta.parentId === firstSelection.nodeId) {
    return {
      childNodeId: secondSelection.nodeId,
      parentAnchor: firstSelection.side,
      childAnchor: secondSelection.side,
    };
  }

  return null;
};

const expandRect = (rect, padding) => ({
  left: rect.left - padding,
  top: rect.top - padding,
  width: rect.width + padding * 2,
  height: rect.height + padding * 2,
  right: rect.left + rect.width + padding,
  bottom: rect.top + rect.height + padding,
});

const toFullRect = (rect) => ({
  ...rect,
  right: rect.left + rect.width,
  bottom: rect.top + rect.height,
});

const dedupePoints = (points) => {
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }

    const previousPoint = points[index - 1];
    return point.x !== previousPoint.x || point.y !== previousPoint.y;
  });
};

const segmentIntersectsRect = (startPoint, endPoint, rect) => {
  if (startPoint.x === endPoint.x) {
    const x = startPoint.x;
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);

    return x >= rect.left && x <= rect.right && maxY >= rect.top && minY <= rect.bottom;
  }

  const y = startPoint.y;
  const minX = Math.min(startPoint.x, endPoint.x);
  const maxX = Math.max(startPoint.x, endPoint.x);

  return y >= rect.top && y <= rect.bottom && maxX >= rect.left && minX <= rect.right;
};

const pathIntersectsObstacles = (points, obstacles) => {
  for (let index = 1; index < points.length; index += 1) {
    const startPoint = points[index - 1];
    const endPoint = points[index];

    if (startPoint.x !== endPoint.x && startPoint.y !== endPoint.y) {
      return true;
    }

    if (obstacles.some((rect) => segmentIntersectsRect(startPoint, endPoint, rect))) {
      return true;
    }
  }

  return false;
};

const buildPathString = (points) => {
  return dedupePoints(points)
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
};

const createOrthogonalPath = (startAnchor, endAnchor, obstacles, canvasSize) => {
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

  const minObstacleLeft = obstacles.length
    ? Math.min(...obstacles.map((rect) => rect.left))
    : 0;
  const maxObstacleRight = obstacles.length
    ? Math.max(...obstacles.map((rect) => rect.right))
    : canvasSize.width;
  const minObstacleTop = obstacles.length
    ? Math.min(...obstacles.map((rect) => rect.top))
    : 0;
  const maxObstacleBottom = obstacles.length
    ? Math.max(...obstacles.map((rect) => rect.bottom))
    : canvasSize.height;

  const buildCandidatePoints = (strategyValue, alternateValue) => {
    if (startIsHorizontal && endIsHorizontal) {
      return [
        { x: startAnchor.x, y: startAnchor.y },
        startLead,
        { x: strategyValue, y: startLead.y },
        { x: strategyValue, y: endLead.y },
        endLead,
        { x: endAnchor.x, y: endAnchor.y },
      ];
    }

    if (!startIsHorizontal && !endIsHorizontal) {
      return [
        { x: startAnchor.x, y: startAnchor.y },
        startLead,
        { x: startLead.x, y: strategyValue },
        { x: endLead.x, y: strategyValue },
        endLead,
        { x: endAnchor.x, y: endAnchor.y },
      ];
    }

    return [
      { x: startAnchor.x, y: startAnchor.y },
      startLead,
      startIsHorizontal
        ? { x: alternateValue, y: startLead.y }
        : { x: startLead.x, y: alternateValue },
      startIsHorizontal
        ? { x: alternateValue, y: endLead.y }
        : { x: endLead.x, y: alternateValue },
      endLead,
      { x: endAnchor.x, y: endAnchor.y },
    ];
  };

  const candidateStrategies = [];

  if (startIsHorizontal && endIsHorizontal) {
    candidateStrategies.push(Math.round((startLead.x + endLead.x) / 2));
    candidateStrategies.push(
      Math.max(startLead.x, endLead.x, maxObstacleRight) + CANVAS_PADDING / 3
    );
    candidateStrategies.push(
      Math.min(startLead.x, endLead.x, minObstacleLeft) - CANVAS_PADDING / 3
    );
  } else if (!startIsHorizontal && !endIsHorizontal) {
    candidateStrategies.push(Math.round((startLead.y + endLead.y) / 2));
    candidateStrategies.push(
      Math.max(startLead.y, endLead.y, maxObstacleBottom) + CANVAS_PADDING / 3
    );
    candidateStrategies.push(
      Math.min(startLead.y, endLead.y, minObstacleTop) - CANVAS_PADDING / 3
    );
  } else {
    candidateStrategies.push(Math.round((startLead.x + endLead.x) / 2));
    candidateStrategies.push(Math.round((startLead.y + endLead.y) / 2));
    candidateStrategies.push(
      startIsHorizontal
        ? Math.max(endLead.x, maxObstacleRight) + CANVAS_PADDING / 3
        : Math.max(endLead.y, maxObstacleBottom) + CANVAS_PADDING / 3
    );
    candidateStrategies.push(
      startIsHorizontal
        ? Math.min(endLead.x, minObstacleLeft) - CANVAS_PADDING / 3
        : Math.min(endLead.y, minObstacleTop) - CANVAS_PADDING / 3
    );
  }

  const alternateStrategies = [];

  if (startIsHorizontal !== endIsHorizontal) {
    alternateStrategies.push(startIsHorizontal ? endLead.x : endLead.y);
    alternateStrategies.push(startIsHorizontal ? startLead.x : startLead.y);
  }

  const candidates = candidateStrategies.flatMap((strategyValue) => {
    if (startIsHorizontal === endIsHorizontal) {
      return [buildCandidatePoints(strategyValue)];
    }

    return alternateStrategies.map((alternateValue) =>
      buildCandidatePoints(strategyValue, alternateValue)
    );
  });

  const clearCandidate = candidates.find(
    (candidatePoints) => !pathIntersectsObstacles(dedupePoints(candidatePoints), obstacles)
  );

  if (clearCandidate) {
    return buildPathString(clearCandidate);
  }

  points.push(endLead);
  points.push({ x: endAnchor.x, y: endAnchor.y });

  return buildPathString(points);
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
  const [pendingAnchorSelection, setPendingAnchorSelection] = useState(null);

  const flattenedNodes = useMemo(() => flattenNodes(nodes), [nodes]);
  const autoPositions = useMemo(() => buildAutoPositions(nodes), [nodes]);
  const nodeMetaById = useMemo(
    () =>
      flattenedNodes.reduce((result, item) => {
        result[item.node.id] = item;
        return result;
      }, {}),
    [flattenedNodes]
  );

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

      const { start, end, manual } = getConnectionAnchorPair(node, parentRect, childRect);
      const obstacles = Object.entries(nodeRects)
        .filter(([id]) => id !== node.id && id !== parentId)
        .map(([, rect]) => expandRect(toFullRect(rect), OBSTACLE_PADDING));
      const isPendingConnector =
        pendingAnchorSelection &&
        (pendingAnchorSelection.nodeId === node.id || pendingAnchorSelection.nodeId === parentId);

      return {
        id: `${parentId}-${node.id}`,
        d: createOrthogonalPath(start, end, obstacles, canvasSize),
        manual,
        pending: Boolean(isPendingConnector),
      };
    })
    .filter(Boolean);
  const pendingNodeMeta = pendingAnchorSelection
    ? nodeMetaById[pendingAnchorSelection.nodeId]
    : null;

  const handleCanvasMouseDown = (event) => {
    if (event.target.closest(".oc-node, .free-layout-anchor")) {
      return;
    }

    setPendingAnchorSelection(null);
  };

  const handleAnchorClick = async (event, nodeMeta, side) => {
    event.preventDefault();
    event.stopPropagation();

    if (!contentEditable) {
      return;
    }

    onCloseContextMenu?.();
    dragMovedRef.current = false;
    suppressClickRef.current = false;

    if (onClickNode) {
      onClickNode(nodeMeta.node);
    }

    selectNodeService.sendSelectedNodeInfo(nodeMeta.node.id);

    const nextSelection = { nodeId: nodeMeta.node.id, side };

    if (
      pendingAnchorSelection?.nodeId === nextSelection.nodeId &&
      pendingAnchorSelection?.side === nextSelection.side
    ) {
      setPendingAnchorSelection(null);
      return;
    }

    if (!pendingAnchorSelection) {
      setPendingAnchorSelection(nextSelection);
      return;
    }

    const resolvedConnection = resolveConnectionSelection(
      pendingAnchorSelection,
      nextSelection,
      nodeMetaById
    );

    if (!resolvedConnection) {
      setPendingAnchorSelection(nextSelection);
      return;
    }

    await onUpdateNodeLayout(resolvedConnection.childNodeId, {
      connectorParentAnchor: resolvedConnection.parentAnchor,
      connectorChildAnchor: resolvedConnection.childAnchor,
    });

    setPendingAnchorSelection(null);
  };

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
    setPendingAnchorSelection(null);
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
      onMouseDown={handleCanvasMouseDown}
      style={{
        width: `${canvasSize.width}px`,
        height: `${canvasSize.height}px`,
      }}
    >
      <svg className="free-layout-connectors" aria-hidden="true">
        {connectors.map((connector) => (
          <path
            key={connector.id}
            className={`${connector.manual ? "manual" : "auto"}${
              connector.pending ? " pending" : ""
            }`}
            d={connector.d}
          />
        ))}
      </svg>
      <ul className="free-layout-list">
        {flattenedNodes.map((nodeMeta) => {
          const { node, level, parentId } = nodeMeta;
          const position = getPosition(node);
          const isDragging = dragState?.node?.id === node.id;
          const isPendingNode = pendingAnchorSelection?.nodeId === node.id;
          const isConnectableNode = Boolean(
            pendingNodeMeta &&
              pendingAnchorSelection.nodeId !== node.id &&
              (pendingNodeMeta.parentId === node.id || parentId === pendingAnchorSelection.nodeId)
          );
          const showAnchors =
            selectedNodeId === node.id ||
            isDragging ||
            isPendingNode ||
            isConnectableNode;

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
                  (isPendingNode ? " pending-connection" : "") +
                  (isConnectableNode ? " connectable-connection" : "") +
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
                <div
                  className={`free-layout-anchors${
                    showAnchors ? " visible" : ""
                  }`}
                >
                  {ANCHOR_SIDES.map((side) => {
                    const isActive =
                      pendingAnchorSelection?.nodeId === node.id &&
                      pendingAnchorSelection?.side === side;

                    return (
                      <button
                        key={side}
                        type="button"
                        className={`free-layout-anchor ${side}${
                          isActive ? " active" : ""
                        }${isConnectableNode ? " connectable" : ""}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => handleAnchorClick(event, nodeMeta, side)}
                        title={`Verbindung über ${side} setzen`}
                        aria-label={`${node.name || node.id}: Verbindung über ${side} setzen`}
                      />
                    );
                  })}
                </div>
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