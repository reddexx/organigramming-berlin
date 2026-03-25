import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const CONNECTOR_EDGE_OVERLAP = 4;
const GRID_SIZE = 24;
const ALIGNMENT_THRESHOLD = 8;
const ANCHOR_FOCUS_DISTANCE = 40;

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
    y: rect.top + CONNECTOR_EDGE_OVERLAP,
    dx: 0,
    dy: -1,
  },
  right: {
    side: "right",
    x: rect.left + rect.width - CONNECTOR_EDGE_OVERLAP,
    y: rect.top + rect.height / 2,
    dx: 1,
    dy: 0,
  },
  bottom: {
    side: "bottom",
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height - CONNECTOR_EDGE_OVERLAP,
    dx: 0,
    dy: 1,
  },
  left: {
    side: "left",
    x: rect.left + CONNECTOR_EDGE_OVERLAP,
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

const getAnchorElementData = (element) => {
  const anchorElement = element?.closest?.(".free-layout-anchor");

  if (!anchorElement) {
    return null;
  }

  const nodeId = anchorElement.dataset.nodeId;
  const side = anchorElement.dataset.anchorSide;

  if (!nodeId || !isValidAnchorSide(side)) {
    return null;
  }

  return { nodeId, side };
};

const getConnectableNodeIds = (sourceNodeId, nodeMetaById) => {
  const sourceMeta = nodeMetaById[sourceNodeId];

  if (!sourceMeta) {
    return [];
  }

  const nextIds = [];

  if (sourceMeta.parentId) {
    nextIds.push(sourceMeta.parentId);
  }

  Object.values(nodeMetaById).forEach((nodeMeta) => {
    if (nodeMeta.parentId === sourceNodeId) {
      nextIds.push(nodeMeta.node.id);
    }
  });

  return nextIds;
};

const getClosestAnchorSelection = (pointer, nodeIds, nodeRects, maxDistance) => {
  let closestAnchor = null;

  nodeIds.forEach((nodeId) => {
    const rect = nodeRects[nodeId];

    if (!rect) {
      return;
    }

    const anchors = getAnchorsFromRect(rect);

    ANCHOR_SIDES.forEach((side) => {
      const anchor = anchors[side];
      const distance = Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y);

      if (distance > maxDistance) {
        return;
      }

      if (!closestAnchor || distance < closestAnchor.distance) {
        closestAnchor = {
          nodeId,
          side,
          distance,
        };
      }
    });
  });

  return closestAnchor
    ? { nodeId: closestAnchor.nodeId, side: closestAnchor.side }
    : null;
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

const snapToGrid = (value) => Math.max(0, Math.round(value / GRID_SIZE) * GRID_SIZE);

const getRectMetrics = (rect) => ({
  left: rect.left,
  centerX: rect.left + rect.width / 2,
  right: rect.left + rect.width,
  top: rect.top,
  centerY: rect.top + rect.height / 2,
  bottom: rect.top + rect.height,
});

const getBestAlignment = (movingValue, otherValue, nextPosition, axis, otherRect) => {
  const distance = Math.abs(movingValue - otherValue);

  if (distance > ALIGNMENT_THRESHOLD) {
    return null;
  }

  return {
    distance,
    axis,
    value: otherValue,
    otherRect,
    nextPosition,
  };
};

const getDragSnapResult = (nodeId, rawPosition, nodeRects) => {
  const movingRect = nodeRects[nodeId];

  if (!movingRect) {
    return {
      position: {
        x: snapToGrid(rawPosition.x),
        y: snapToGrid(rawPosition.y),
      },
      guides: [],
    };
  }

  let nextPosition = {
    x: snapToGrid(rawPosition.x),
    y: snapToGrid(rawPosition.y),
  };

  const snappedRect = {
    left: nextPosition.x,
    top: nextPosition.y,
    width: movingRect.width,
    height: movingRect.height,
  };
  const movingMetrics = getRectMetrics(snappedRect);
  let bestVerticalGuide = null;
  let bestHorizontalGuide = null;

  Object.entries(nodeRects).forEach(([otherNodeId, otherRect]) => {
    if (otherNodeId === nodeId) {
      return;
    }

    const otherMetrics = getRectMetrics(otherRect);
    const verticalCandidates = [
      getBestAlignment(
        movingMetrics.left,
        otherMetrics.left,
        { ...nextPosition, x: otherMetrics.left },
        "vertical",
        otherRect
      ),
      getBestAlignment(
        movingMetrics.centerX,
        otherMetrics.centerX,
        { ...nextPosition, x: otherMetrics.centerX - movingRect.width / 2 },
        "vertical",
        otherRect
      ),
      getBestAlignment(
        movingMetrics.right,
        otherMetrics.right,
        { ...nextPosition, x: otherMetrics.right - movingRect.width },
        "vertical",
        otherRect
      ),
    ].filter(Boolean);
    const horizontalCandidates = [
      getBestAlignment(
        movingMetrics.top,
        otherMetrics.top,
        { ...nextPosition, y: otherMetrics.top },
        "horizontal",
        otherRect
      ),
      getBestAlignment(
        movingMetrics.centerY,
        otherMetrics.centerY,
        { ...nextPosition, y: otherMetrics.centerY - movingRect.height / 2 },
        "horizontal",
        otherRect
      ),
      getBestAlignment(
        movingMetrics.bottom,
        otherMetrics.bottom,
        { ...nextPosition, y: otherMetrics.bottom - movingRect.height },
        "horizontal",
        otherRect
      ),
    ].filter(Boolean);

    const verticalMatch = verticalCandidates.sort((left, right) => left.distance - right.distance)[0];
    const horizontalMatch = horizontalCandidates.sort((left, right) => left.distance - right.distance)[0];

    if (!bestVerticalGuide || (verticalMatch && verticalMatch.distance < bestVerticalGuide.distance)) {
      bestVerticalGuide = verticalMatch || bestVerticalGuide;
    }

    if (
      !bestHorizontalGuide ||
      (horizontalMatch && horizontalMatch.distance < bestHorizontalGuide.distance)
    ) {
      bestHorizontalGuide = horizontalMatch || bestHorizontalGuide;
    }
  });

  if (bestVerticalGuide) {
    nextPosition.x = Math.max(0, Math.round(bestVerticalGuide.nextPosition.x));
  }

  if (bestHorizontalGuide) {
    nextPosition.y = Math.max(0, Math.round(bestHorizontalGuide.nextPosition.y));
  }

  const resolvedRect = {
    left: nextPosition.x,
    top: nextPosition.y,
    width: movingRect.width,
    height: movingRect.height,
  };
  const guides = [];

  if (bestVerticalGuide) {
    guides.push({
      orientation: "vertical",
      x: bestVerticalGuide.value,
      y1: Math.min(resolvedRect.top, bestVerticalGuide.otherRect.top) - 24,
      y2:
        Math.max(
          resolvedRect.top + resolvedRect.height,
          bestVerticalGuide.otherRect.top + bestVerticalGuide.otherRect.height
        ) + 24,
    });
  }

  if (bestHorizontalGuide) {
    guides.push({
      orientation: "horizontal",
      y: bestHorizontalGuide.value,
      x1: Math.min(resolvedRect.left, bestHorizontalGuide.otherRect.left) - 24,
      x2:
        Math.max(
          resolvedRect.left + resolvedRect.width,
          bestHorizontalGuide.otherRect.left + bestHorizontalGuide.otherRect.width
        ) + 24,
    });
  }

  return {
    position: nextPosition,
    guides,
  };
};

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
  const nodeRectsRef = useRef({});
  const connectorDragStateRef = useRef(null);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [nodeRects, setNodeRects] = useState({});
  const [draftPositions, setDraftPositions] = useState({});
  const [dragState, setDragState] = useState(null);
  const [connectorDragState, setConnectorDragState] = useState(null);
  const [dragGuides, setDragGuides] = useState([]);

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

  const getPosition = useCallback((node) => {
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
  }, [autoPositions, draftPositions]);

  const getCanvasPointer = useCallback((clientX, clientY) => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return null;
    }

    const rect = wrapper.getBoundingClientRect();
    const scaleX = rect.width ? wrapper.offsetWidth / rect.width : 1;
    const scaleY = rect.height ? wrapper.offsetHeight / rect.height : 1;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  useEffect(() => {
    nodeRectsRef.current = nodeRects;
  }, [nodeRects]);

  useEffect(() => {
    connectorDragStateRef.current = connectorDragState;
  }, [connectorDragState]);

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
      const nextRects = {};

      flattenedNodes.forEach(({ node }) => {
        const element = nodeRefs.current[node.id];
        if (!element) {
          return;
        }

        const measuredElement = element.querySelector(".oc-container") || element;
        const position = getPosition(node);
        nextRects[node.id] = {
          left: position.x + measuredElement.offsetLeft,
          top: position.y + measuredElement.offsetTop,
          width: measuredElement.offsetWidth,
          height: measuredElement.offsetHeight,
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
  }, [flattenedNodes, draftPositions, autoPositions, getPosition]);

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    document.body.classList.add("free-layout-dragging");

    const handleMouseMove = (event) => {
      event.preventDefault();

      const rawX = Math.max(
        0,
        Math.round(dragState.startPosition.x + event.clientX - dragState.startX)
      );
      const rawY = Math.max(
        0,
        Math.round(dragState.startPosition.y + event.clientY - dragState.startY)
      );
      const { position: snappedPosition, guides } = getDragSnapResult(
        dragState.node.id,
        { x: rawX, y: rawY },
        nodeRects
      );

      if (
        Math.abs(event.clientX - dragState.startX) > 2 ||
        Math.abs(event.clientY - dragState.startY) > 2
      ) {
        dragMovedRef.current = true;
      }

      setDragGuides(guides);
      setDraftPositions((current) => ({
        ...current,
        [dragState.node.id]: snappedPosition,
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
      setDragGuides([]);
      setDraftPositions((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[dragState.node.id];
        return nextDrafts;
      });
    };

    const handleWindowBlur = () => {
      setDragState(null);
      dragMovedRef.current = false;
      setDragGuides([]);
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
  }, [dragState, draftPositions, nodeRects, onUpdateNodeLayout]);

  useEffect(() => {
    if (!connectorDragState) {
      return undefined;
    }

    document.body.classList.add("free-layout-connecting");

    const updateHoveredAnchor = (event) => {
      setConnectorDragState((current) => {
        if (!current) {
          return current;
        }

        const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
        const exactAnchor = getAnchorElementData(hoveredElement);
        const canvasPointer = getCanvasPointer(event.clientX, event.clientY);
        const connectableNodeIds = getConnectableNodeIds(current.nodeId, nodeMetaById);

        let hoveredAnchor =
          exactAnchor && connectableNodeIds.includes(exactAnchor.nodeId)
            ? exactAnchor
            : null;

        if (!hoveredAnchor && canvasPointer) {
          hoveredAnchor = getClosestAnchorSelection(
            canvasPointer,
            connectableNodeIds,
            nodeRectsRef.current,
            Math.max(ANCHOR_FOCUS_DISTANCE, 64)
          );
        }

        return {
          ...current,
          pointer: canvasPointer,
          hoveredAnchor,
        };
      });
    };

    const handleMouseMove = (event) => {
      event.preventDefault();
      updateHoveredAnchor(event);
    };

    const handleMouseUp = async (event) => {
      const activeState = connectorDragStateRef.current;

      if (!activeState) {
        return;
      }

      const targetAnchor =
        getAnchorElementData(document.elementFromPoint(event.clientX, event.clientY)) ||
        activeState.hoveredAnchor;
      const sourceAnchor = {
        nodeId: activeState.nodeId,
        side: activeState.side,
      };
      const resolvedConnection = targetAnchor
        ? resolveConnectionSelection(sourceAnchor, targetAnchor, nodeMetaById)
        : null;

      suppressClickRef.current = true;
      setConnectorDragState(null);

      if (!resolvedConnection) {
        return;
      }

      await onUpdateNodeLayout(resolvedConnection.childNodeId, {
        connectorParentAnchor: resolvedConnection.parentAnchor,
        connectorChildAnchor: resolvedConnection.childAnchor,
      });
    };

    const handleWindowBlur = () => {
      setConnectorDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.body.classList.remove("free-layout-connecting");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [connectorDragState, getCanvasPointer, nodeMetaById, onUpdateNodeLayout]);

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
  }, [flattenedNodes, nodeRects, getPosition]);

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
        connectorDragState &&
        (connectorDragState.nodeId === node.id || connectorDragState.nodeId === parentId);

      return {
        id: `${parentId}-${node.id}`,
        d: createOrthogonalPath(start, end, obstacles, canvasSize),
        manual,
        pending: Boolean(isPendingConnector),
      };
    })
    .filter(Boolean);
  const pendingNodeMeta = connectorDragState
    ? nodeMetaById[connectorDragState.nodeId]
    : null;

  const previewConnector = useMemo(() => {
    if (!connectorDragState) {
      return null;
    }

    const sourceRect = nodeRects[connectorDragState.nodeId];

    if (!sourceRect) {
      return null;
    }

    const sourceAnchor = getAnchorsFromRect(sourceRect)[connectorDragState.side];
    let targetAnchor;

    if (connectorDragState.hoveredAnchor?.nodeId) {
      const hoveredRect = nodeRects[connectorDragState.hoveredAnchor.nodeId];

      if (hoveredRect) {
        targetAnchor = getAnchorsFromRect(hoveredRect)[connectorDragState.hoveredAnchor.side];
      }
    }

    if (!targetAnchor) {
      if (!connectorDragState.pointer) {
        return null;
      }

      targetAnchor = {
        x: connectorDragState.pointer.x,
        y: connectorDragState.pointer.y,
        dx: sourceAnchor.dx,
        dy: sourceAnchor.dy,
      };
    }

    const targetNodeId = connectorDragState.hoveredAnchor?.nodeId;
    const obstacles = Object.entries(nodeRects)
      .filter(([id]) => id !== connectorDragState.nodeId && id !== targetNodeId)
      .map(([, rect]) => expandRect(toFullRect(rect), OBSTACLE_PADDING));

    return createOrthogonalPath(sourceAnchor, targetAnchor, obstacles, canvasSize);
  }, [canvasSize, connectorDragState, nodeRects]);

  const handleCanvasMouseDown = (event) => {
    if (event.target.closest(".oc-node, .free-layout-anchor")) {
      return;
    }

    setConnectorDragState(null);
  };

  const handleAnchorMouseDown = (event, nodeMeta, side) => {
    if (!contentEditable || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    onCloseContextMenu?.();
    dragMovedRef.current = false;
    suppressClickRef.current = false;
    // Do NOT call onClickNode or selectNodeService here —
    // holding the left mouse button on an anchor starts a connector drag
    // and must not open the organisation tab or change sidebar selection.
    setConnectorDragState({
      nodeId: nodeMeta.node.id,
      side,
      pointer: getCanvasPointer(event.clientX, event.clientY),
      hoveredAnchor: null,
    });
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

    onCloseContextMenu?.();
    setConnectorDragState(null);
    dragMovedRef.current = false;
    setDragState({
      node,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: getPosition(node),
    });
  };

  const handleNodeClick = (event, node) => {
    if (event?.button !== undefined && event.button !== 0) {
      return;
    }

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
      onClickNode(node, { openSidebar: false });
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
        {dragGuides.map((guide) =>
          guide.orientation === "vertical" ? (
            <line
              key={`vertical-${guide.x}-${guide.y1}-${guide.y2}`}
              className="alignment-guide"
              x1={guide.x}
              x2={guide.x}
              y1={guide.y1}
              y2={guide.y2}
            />
          ) : (
            <line
              key={`horizontal-${guide.y}-${guide.x1}-${guide.x2}`}
              className="alignment-guide"
              x1={guide.x1}
              x2={guide.x2}
              y1={guide.y}
              y2={guide.y}
            />
          )
        )}
        {previewConnector && <path className="preview pending" d={previewConnector} />}
      </svg>
      <ul className="free-layout-list">
        {flattenedNodes.map((nodeMeta) => {
          const { node, level, parentId } = nodeMeta;
          const position = getPosition(node);
          const isDragging = dragState?.node?.id === node.id;
          const isPendingNode = connectorDragState?.nodeId === node.id;
          const isHoveredTarget = connectorDragState?.hoveredAnchor?.nodeId === node.id;
          const isConnectableNode = Boolean(
            pendingNodeMeta &&
              connectorDragState.nodeId !== node.id &&
              (pendingNodeMeta.parentId === node.id || parentId === connectorDragState.nodeId)
          );
          const showAnchors =
            contentEditable &&
            (selectedNodeId === node.id ||
              isDragging ||
              isPendingNode ||
              isConnectableNode ||
              isHoveredTarget);

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
                  (isHoveredTarget ? " hovered-connection" : "") +
                  (node.layout?.style ? ` ${node.layout.style}` : "") +
                  (isDragging ? " position-dragging" : "") +
                  (node.organisations && node.organisations.length > 0
                    ? node.organisations.length > 1
                      ? " has-children"
                      : " has-child"
                    : " end-node")
                }
                onClick={(event) => handleNodeClick(event, node)}
                onMouseDown={(event) => handleNodeMouseDown(event, node)}
                onContextMenu={(event) => handleContextMenu(event, node)}
                onDragStart={(event) => event.preventDefault()}
              >
                {contentEditable && (
                  <div
                    className={`free-layout-anchors${showAnchors ? " visible" : ""}${
                      connectorDragState ? " connecting" : ""
                    }`}
                  >
                    {ANCHOR_SIDES.map((side) => {
                      const isActive =
                        connectorDragState?.nodeId === node.id &&
                        connectorDragState?.side === side;
                      const isHovered =
                        connectorDragState?.hoveredAnchor?.nodeId === node.id &&
                        connectorDragState?.hoveredAnchor?.side === side;

                      return (
                        <button
                          key={side}
                          type="button"
                          className={`free-layout-anchor ${side}${
                            isActive ? " active" : ""
                          }${isConnectableNode ? " connectable" : ""}${
                            isHovered ? " hovered" : ""
                          }`}
                          data-node-id={node.id}
                          data-anchor-side={side}
                          onMouseDown={(event) => handleAnchorMouseDown(event, nodeMeta, side)}
                          title={`Verbindung über ${side} setzen`}
                          aria-label={`${node.name || node.id}: Verbindung über ${side} setzen`}
                        />
                      );
                    })}
                  </div>
                )}
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