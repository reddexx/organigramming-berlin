import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Button, Form, Modal } from "react-bootstrap";

import { selectNodeService } from "../../services/service";
import ChartNodeCard from "./ChartNodeCard";

const propTypes = {
  nodes: PropTypes.array,
  freeConnections: PropTypes.array,
  contentEditable: PropTypes.bool,
  onClickNode: PropTypes.func,
  onContextMenu: PropTypes.func,
  onCloseContextMenu: PropTypes.func,
  onUpdateNodeLayout: PropTypes.func.isRequired,
  onUpdateFreeConnections: PropTypes.func.isRequired,
  onCreateNodeAtPosition: PropTypes.func,
  onPasteNodeAtPosition: PropTypes.func,
  canPasteAtPosition: PropTypes.bool,
};

const defaultProps = {
  nodes: [],
  freeConnections: [],
  contentEditable: true,
  onClickNode: null,
  onContextMenu: null,
  onCloseContextMenu: null,
  onCreateNodeAtPosition: null,
  onPasteNodeAtPosition: null,
  canPasteAtPosition: false,
};

const LEVEL_GAP = 220;
const SIBLING_GAP = 56;
const START_X = 80;
const START_Y = 40;
const CANVAS_PADDING = 80;
const ANCHOR_OFFSET = 24;
const OBSTACLE_PADDING = 18;
const ANCHOR_SIDES = ["top", "right", "bottom", "left"];
const CONNECTOR_EDGE_OVERLAP = 4;
const EDGE_SLOT_PADDING = 28;
const EDGE_SLOT_SPACING = 18;
const GRID_SIZE = 24;
const ALIGNMENT_THRESHOLD = 8;
const ANCHOR_FOCUS_DISTANCE = 40;
const MIN_NODE_WIDTH = 160;
const MAX_NODE_WIDTH = 480;
const MIN_NODE_HEIGHT = 0;
const MAX_NODE_HEIGHT = 640;
const DEFAULT_CONNECTOR_COLOR = "#6c757d";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getConnectorRenderKey = (connector, appearance) => {
  return [
    connector.id,
    appearance.color || DEFAULT_CONNECTOR_COLOR,
    appearance.sourceArrow ? "source-arrow" : "no-source-arrow",
    appearance.targetArrow ? "target-arrow" : "no-target-arrow",
  ].join(":");
};

const getConnectorAppearance = (connector) => {
  if (connector.type === "free") {
    return {
      color: connector.color || DEFAULT_CONNECTOR_COLOR,
      sourceArrow: connector.sourceArrow === true,
      targetArrow: connector.targetArrow === true,
    };
  }

  return {
    color: connector.color || DEFAULT_CONNECTOR_COLOR,
    sourceArrow: connector.sourceArrow === true,
    targetArrow: connector.targetArrow === true,
  };
};

const isNoteNode = (node) => node?.kind === "note";

const getEstimatedNodeHeight = (nodeRects, nodeId) => nodeRects[nodeId]?.height || 160;

const flattenNodes = (nodes, parentId = null, level = 1, result = []) => {
  (nodes || []).forEach((node) => {
    result.push({ node, parentId, level });
    flattenNodes(node.organisations || [], node.id, level + 1, result);
  });

  return result;
};

const getNodeWidth = (node) => node?.layout?.nodeWidth || 224;

const getAnchorSlotOffset = (rect, side, index = 0, total = 1) => {
  if (!rect || total <= 1) {
    return 0;
  }

  const span = side === "top" || side === "bottom" ? rect.width : rect.height;
  const centeredIndex = index - (total - 1) / 2;
  const maxOffset = Math.max(0, span / 2 - EDGE_SLOT_PADDING);

  return clamp(centeredIndex * EDGE_SLOT_SPACING, -maxOffset, maxOffset);
};

const getAnchorsFromRect = (rect, slotAssignments = {}) => ({
  top: {
    side: "top",
    x:
      rect.left +
      rect.width / 2 +
      getAnchorSlotOffset(
        rect,
        "top",
        slotAssignments.top?.index,
        slotAssignments.top?.total
      ),
    y: rect.top + CONNECTOR_EDGE_OVERLAP,
    dx: 0,
    dy: -1,
  },
  right: {
    side: "right",
    x: rect.left + rect.width - CONNECTOR_EDGE_OVERLAP,
    y:
      rect.top +
      rect.height / 2 +
      getAnchorSlotOffset(
        rect,
        "right",
        slotAssignments.right?.index,
        slotAssignments.right?.total
      ),
    dx: 1,
    dy: 0,
  },
  bottom: {
    side: "bottom",
    x:
      rect.left +
      rect.width / 2 +
      getAnchorSlotOffset(
        rect,
        "bottom",
        slotAssignments.bottom?.index,
        slotAssignments.bottom?.total
      ),
    y: rect.top + rect.height - CONNECTOR_EDGE_OVERLAP,
    dx: 0,
    dy: 1,
  },
  left: {
    side: "left",
    x: rect.left + CONNECTOR_EDGE_OVERLAP,
    y:
      rect.top +
      rect.height / 2 +
      getAnchorSlotOffset(
        rect,
        "left",
        slotAssignments.left?.index,
        slotAssignments.left?.total
      ),
    dx: -1,
    dy: 0,
  },
});

const getSideAnchorFromRect = (rect, side, slotAssignment = {}) => {
  return getAnchorsFromRect(rect, {
    [side]: slotAssignment,
  })[side];
};

const getCenterSideAnchor = (rect, side) => {
  return getAnchorsFromRect(rect)[side];
};

const getSideBundlePoint = (rect, side) => {
  const centerAnchor = getAnchorsFromRect(rect)[side];

  if (!centerAnchor) {
    return null;
  }

  return {
    x: centerAnchor.x + centerAnchor.dx * ANCHOR_OFFSET,
    y: centerAnchor.y + centerAnchor.dy * ANCHOR_OFFSET,
  };
};

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

const getConnectionPairKey = (firstNodeId, secondNodeId) =>
  [firstNodeId, secondNodeId].sort().join("::");

const getTargetAnchorSideForNewNode = (sourceAnchor, targetCenter) => {
  if (!sourceAnchor || !targetCenter) {
    return "top";
  }

  const deltaX = targetCenter.x - sourceAnchor.x;
  const deltaY = targetCenter.y - sourceAnchor.y;

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX >= 0 ? "left" : "right";
  }

  return deltaY >= 0 ? "top" : "bottom";
};

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

const buildConnectorEndpointLayout = (endpoints = []) => {
  const endpointGroups = endpoints.reduce((result, endpoint) => {
    const groupKey = `${endpoint.nodeId}:${endpoint.side}`;

    if (!result[groupKey]) {
      result[groupKey] = [];
    }

    result[groupKey].push(endpoint.endpointKey);
    return result;
  }, {});

  const endpointAssignments = Object.values(endpointGroups).reduce(
    (result, endpointKeys) => {
      endpointKeys.forEach((endpointKey, index) => {
        result[endpointKey] = {
          index,
          total: endpointKeys.length,
        };
      });

      return result;
    },
    {}
  );

  return {
    endpointAssignments,
    endpointGroups,
  };
};

const getConnectorEndpointAssignment = (endpointAssignments, endpointKey) => {
  return endpointAssignments[endpointKey] || { index: 0, total: 1 };
};

const getNodeSideEndpointCount = (endpointGroups, nodeId, side) => {
  return endpointGroups[`${nodeId}:${side}`]?.length || 0;
};

const shouldBundleNodeSide = (endpointGroups, nodeId, side) => {
  return getNodeSideEndpointCount(endpointGroups, nodeId, side) > 1;
};

const getConnectorRouteAnchor = (
  rect,
  side,
  endpointGroups,
  nodeId,
  slotAssignment = {}
) => {
  if (shouldBundleNodeSide(endpointGroups, nodeId, side)) {
    return getCenterSideAnchor(rect, side);
  }

  return getSideAnchorFromRect(rect, side, slotAssignment);
};

const resolveConnectionSelection = (
  firstSelection,
  secondSelection,
  nodeMetaById,
  freeConnections = []
) => {
  const firstMeta = nodeMetaById[firstSelection.nodeId];
  const secondMeta = nodeMetaById[secondSelection.nodeId];

  if (!firstMeta || !secondMeta || firstSelection.nodeId === secondSelection.nodeId) {
    return null;
  }

  if (firstMeta.parentId === secondSelection.nodeId) {
    return {
      type: "hierarchy",
      childNodeId: firstSelection.nodeId,
      parentAnchor: secondSelection.side,
      childAnchor: firstSelection.side,
    };
  }

  if (secondMeta.parentId === firstSelection.nodeId) {
    return {
      type: "hierarchy",
      childNodeId: secondSelection.nodeId,
      parentAnchor: firstSelection.side,
      childAnchor: secondSelection.side,
    };
  }

  const existingFreeConnection = freeConnections.find(
    (connection) =>
      getConnectionPairKey(connection.sourceNodeId, connection.targetNodeId) ===
      getConnectionPairKey(firstSelection.nodeId, secondSelection.nodeId)
  );

  return {
    type: "free",
    connection: {
      ...(existingFreeConnection || {}),
      id:
        existingFreeConnection?.id ||
        `free-connection-${getConnectionPairKey(firstSelection.nodeId, secondSelection.nodeId)}`,
      sourceNodeId: firstSelection.nodeId,
      targetNodeId: secondSelection.nodeId,
      sourceAnchor: firstSelection.side,
      targetAnchor: secondSelection.side,
    },
  };
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

const getNodeElementData = (element) => {
  const nodeElement = element?.closest?.(".free-layout-node");

  if (!nodeElement?.id) {
    return null;
  }

  return { nodeId: nodeElement.id };
};

const getNearestAnchorSideForPoint = (pointer, rect) => {
  if (!pointer || !rect) {
    return null;
  }

  const distances = [
    { side: "top", distance: Math.abs(pointer.y - rect.top) },
    { side: "right", distance: Math.abs(rect.left + rect.width - pointer.x) },
    { side: "bottom", distance: Math.abs(rect.top + rect.height - pointer.y) },
    { side: "left", distance: Math.abs(pointer.x - rect.left) },
  ];

  distances.sort((firstDistance, secondDistance) => firstDistance.distance - secondDistance.distance);
  return distances[0]?.side || null;
};

const getConnectableNodeIds = (sourceNodeId, nodeMetaById) => {
  if (!nodeMetaById[sourceNodeId]) {
    return [];
  }

  return Object.keys(nodeMetaById).filter((nodeId) => nodeId !== sourceNodeId);
};

const isValidFreeConnection = (connection, nodeMetaById) => {
  return Boolean(
    connection?.sourceNodeId &&
      connection?.targetNodeId &&
      connection.sourceNodeId !== connection.targetNodeId &&
      nodeMetaById[connection.sourceNodeId] &&
      nodeMetaById[connection.targetNodeId] &&
      isValidAnchorSide(connection.sourceAnchor) &&
      isValidAnchorSide(connection.targetAnchor)
  );
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

const getAnchorSelectionAtPointer = ({
  clientX,
  clientY,
  connectableNodeIds,
  nodeRects,
  getCanvasPointer,
}) => {
  const elementsAtPointer = document.elementsFromPoint
    ? document.elementsFromPoint(clientX, clientY)
    : [document.elementFromPoint(clientX, clientY)].filter(Boolean);
  const exactAnchor = elementsAtPointer
    .map((element) => getAnchorElementData(element))
    .find((anchor) => anchor && connectableNodeIds.includes(anchor.nodeId));
  const canvasPointer = getCanvasPointer(clientX, clientY);
  const targetNode = elementsAtPointer
    .map((element) => getNodeElementData(element))
    .find((node) => node && connectableNodeIds.includes(node.nodeId));

  if (exactAnchor) {
    return {
      pointer: canvasPointer,
      anchor: exactAnchor,
    };
  }

  if (targetNode && canvasPointer) {
    const targetRect = nodeRects[targetNode.nodeId];
    const side = getNearestAnchorSideForPoint(canvasPointer, targetRect);

    if (side) {
      return {
        pointer: canvasPointer,
        anchor: {
          nodeId: targetNode.nodeId,
          side,
        },
      };
    }
  }

  return {
    pointer: canvasPointer,
    anchor: canvasPointer
      ? getClosestAnchorSelection(
          canvasPointer,
          connectableNodeIds,
          nodeRects,
          Math.max(ANCHOR_FOCUS_DISTANCE, 64)
        )
      : null,
  };
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

const getResizeSnapResult = (nodeId, nextLayout, nodeRects, handle) => {
  const movingRect = nodeRects[nodeId];

  if (!movingRect) {
    return {
      layout: nextLayout,
      guides: [],
    };
  }

  const resizedRect = {
    left: movingRect.left,
    top: movingRect.top,
    width: nextLayout.nodeWidth,
    height: nextLayout.nodeMinHeight,
  };
  const movingMetrics = getRectMetrics(resizedRect);
  let bestVerticalGuide = null;
  let bestHorizontalGuide = null;

  Object.entries(nodeRects).forEach(([otherNodeId, otherRect]) => {
    if (otherNodeId === nodeId) {
      return;
    }

    const otherMetrics = getRectMetrics(otherRect);

    if (handle === "right" || handle === "corner") {
      const verticalCandidates = [
        getBestAlignment(
          movingMetrics.right,
          otherMetrics.left,
          {
            ...nextLayout,
            nodeWidth: Math.max(MIN_NODE_WIDTH, Math.round(otherMetrics.left - resizedRect.left)),
          },
          "vertical",
          otherRect
        ),
        getBestAlignment(
          movingMetrics.right,
          otherMetrics.centerX,
          {
            ...nextLayout,
            nodeWidth: Math.max(
              MIN_NODE_WIDTH,
              Math.round(otherMetrics.centerX - resizedRect.left)
            ),
          },
          "vertical",
          otherRect
        ),
        getBestAlignment(
          movingMetrics.right,
          otherMetrics.right,
          {
            ...nextLayout,
            nodeWidth: Math.max(MIN_NODE_WIDTH, Math.round(otherMetrics.right - resizedRect.left)),
          },
          "vertical",
          otherRect
        ),
      ].filter(Boolean);

      const verticalMatch = verticalCandidates.sort(
        (left, right) => left.distance - right.distance
      )[0];

      if (!bestVerticalGuide || (verticalMatch && verticalMatch.distance < bestVerticalGuide.distance)) {
        bestVerticalGuide = verticalMatch || bestVerticalGuide;
      }
    }

    if (handle === "bottom" || handle === "corner") {
      const horizontalCandidates = [
        getBestAlignment(
          movingMetrics.bottom,
          otherMetrics.top,
          {
            ...nextLayout,
            nodeMinHeight: Math.max(
              MIN_NODE_HEIGHT,
              Math.round(otherMetrics.top - resizedRect.top)
            ),
          },
          "horizontal",
          otherRect
        ),
        getBestAlignment(
          movingMetrics.bottom,
          otherMetrics.centerY,
          {
            ...nextLayout,
            nodeMinHeight: Math.max(
              MIN_NODE_HEIGHT,
              Math.round(otherMetrics.centerY - resizedRect.top)
            ),
          },
          "horizontal",
          otherRect
        ),
        getBestAlignment(
          movingMetrics.bottom,
          otherMetrics.bottom,
          {
            ...nextLayout,
            nodeMinHeight: Math.max(
              MIN_NODE_HEIGHT,
              Math.round(otherMetrics.bottom - resizedRect.top)
            ),
          },
          "horizontal",
          otherRect
        ),
      ].filter(Boolean);

      const horizontalMatch = horizontalCandidates.sort(
        (left, right) => left.distance - right.distance
      )[0];

      if (
        !bestHorizontalGuide ||
        (horizontalMatch && horizontalMatch.distance < bestHorizontalGuide.distance)
      ) {
        bestHorizontalGuide = horizontalMatch || bestHorizontalGuide;
      }
    }
  });

  let resolvedLayout = { ...nextLayout };

  if (bestVerticalGuide) {
    resolvedLayout.nodeWidth = clamp(
      Math.round(bestVerticalGuide.nextPosition.nodeWidth),
      MIN_NODE_WIDTH,
      MAX_NODE_WIDTH
    );
  }

  if (bestHorizontalGuide) {
    resolvedLayout.nodeMinHeight = clamp(
      Math.round(bestHorizontalGuide.nextPosition.nodeMinHeight),
      MIN_NODE_HEIGHT,
      MAX_NODE_HEIGHT
    );
  }

  const resolvedRect = {
    left: movingRect.left,
    top: movingRect.top,
    width: resolvedLayout.nodeWidth,
    height: resolvedLayout.nodeMinHeight,
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
    layout: resolvedLayout,
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

const getPathMidpoint = (points) => {
  const pathPoints = dedupePoints(points);

  if (!pathPoints.length) {
    return { x: 0, y: 0 };
  }

  if (pathPoints.length === 1) {
    return pathPoints[0];
  }

  const segments = [];
  let totalLength = 0;

  for (let index = 1; index < pathPoints.length; index += 1) {
    const startPoint = pathPoints[index - 1];
    const endPoint = pathPoints[index];
    const length = Math.abs(endPoint.x - startPoint.x) + Math.abs(endPoint.y - startPoint.y);

    if (!length) {
      continue;
    }

    segments.push({ startPoint, endPoint, length });
    totalLength += length;
  }

  if (!segments.length) {
    return pathPoints[0];
  }

  const midpointDistance = totalLength / 2;
  let traversedLength = 0;

  for (const segment of segments) {
    if (traversedLength + segment.length >= midpointDistance) {
      const offset = midpointDistance - traversedLength;

      if (segment.startPoint.x === segment.endPoint.x) {
        const direction = segment.endPoint.y >= segment.startPoint.y ? 1 : -1;

        return {
          x: segment.startPoint.x,
          y: Math.round(segment.startPoint.y + offset * direction),
        };
      }

      const direction = segment.endPoint.x >= segment.startPoint.x ? 1 : -1;

      return {
        x: Math.round(segment.startPoint.x + offset * direction),
        y: segment.startPoint.y,
      };
    }

    traversedLength += segment.length;
  }

  return pathPoints[pathPoints.length - 1];
};

const buildOrthogonalConnector = (
  startAnchor,
  endAnchor,
  obstacles,
  canvasSize,
  options = {}
) => {
  const points = createOrthogonalPathPoints(
    startAnchor,
    endAnchor,
    obstacles,
    canvasSize,
    options
  );

  return {
    d: buildPathString(points),
    midpoint: getPathMidpoint(points),
  };
};

const createOrthogonalPathPoints = (
  startAnchor,
  endAnchor,
  obstacles,
  canvasSize,
  options = {}
) => {
  const defaultStartLead = {
    x: startAnchor.x + startAnchor.dx * ANCHOR_OFFSET,
    y: startAnchor.y + startAnchor.dy * ANCHOR_OFFSET,
  };
  const defaultEndLead = {
    x: endAnchor.x + endAnchor.dx * ANCHOR_OFFSET,
    y: endAnchor.y + endAnchor.dy * ANCHOR_OFFSET,
  };
  const startLead = options.startBundlePoint || defaultStartLead;
  const endLead = options.endBundlePoint || defaultEndLead;

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
        startLead,
        { x: strategyValue, y: startLead.y },
        { x: strategyValue, y: endLead.y },
        endLead,
      ];
    }

    if (!startIsHorizontal && !endIsHorizontal) {
      return [
        startLead,
        { x: startLead.x, y: strategyValue },
        { x: endLead.x, y: strategyValue },
        endLead,
      ];
    }

    return [
      startLead,
      startIsHorizontal
        ? { x: alternateValue, y: startLead.y }
        : { x: startLead.x, y: alternateValue },
      startIsHorizontal
        ? { x: alternateValue, y: endLead.y }
        : { x: endLead.x, y: alternateValue },
      endLead,
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
    return dedupePoints([
      { x: startAnchor.x, y: startAnchor.y },
      defaultStartLead,
      ...(options.startBundlePoint ? [options.startBundlePoint] : []),
      ...clearCandidate.slice(1),
      ...(options.endBundlePoint ? [defaultEndLead] : []),
      { x: endAnchor.x, y: endAnchor.y },
    ]);
  }

  // No clear straight candidate found. Build an orthogonal elbow fallback
  const elbowA = [
    { x: startAnchor.x, y: startAnchor.y },
    defaultStartLead,
    ...(options.startBundlePoint ? [options.startBundlePoint] : []),
    { x: startLead.x, y: endLead.y },
    endLead,
    ...(options.endBundlePoint ? [defaultEndLead] : []),
    { x: endAnchor.x, y: endAnchor.y },
  ];

  const elbowB = [
    { x: startAnchor.x, y: startAnchor.y },
    defaultStartLead,
    ...(options.startBundlePoint ? [options.startBundlePoint] : []),
    { x: endLead.x, y: startLead.y },
    endLead,
    ...(options.endBundlePoint ? [defaultEndLead] : []),
    { x: endAnchor.x, y: endAnchor.y },
  ];

  if (!pathIntersectsObstacles(dedupePoints(elbowA), obstacles)) {
    return dedupePoints(elbowA);
  }

  if (!pathIntersectsObstacles(dedupePoints(elbowB), obstacles)) {
    return dedupePoints(elbowB);
  }

  // As a last resort return elbowA to avoid diagonal segment rendering
  return dedupePoints(elbowA);
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
  freeConnections,
  contentEditable,
  onClickNode,
  onContextMenu,
  onCloseContextMenu,
  onUpdateNodeLayout,
  onUpdateFreeConnections,
  onCreateNodeAtPosition,
  onPasteNodeAtPosition,
  canPasteAtPosition,
}) => {
  const wrapperRef = useRef();
  const nodeRefs = useRef({});
  const dragMovedRef = useRef(false);
  const draftPositionsRef = useRef({});
  const suppressClickRef = useRef(false);
  const nodeRectsRef = useRef({});
  const connectorDragStateRef = useRef(null);
  const hoveredConnectorTimeoutRef = useRef(null);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [nodeRects, setNodeRects] = useState({});
  const [draftPositions, setDraftPositions] = useState({});
  const [draftNodeLayouts, setDraftNodeLayouts] = useState({});
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [connectorDragState, setConnectorDragState] = useState(null);
  const [dragGuides, setDragGuides] = useState([]);
  const [hoveredConnectorId, setHoveredConnectorId] = useState(null);
  const [hoveredResizeNodeId, setHoveredResizeNodeId] = useState(null);
  const [pendingNodeMenu, setPendingNodeMenu] = useState(null);
  const [canvasContextMenu, setCanvasContextMenu] = useState(null);
  const [editingConnector, setEditingConnector] = useState(null);
  const [connectorEditorValues, setConnectorEditorValues] = useState({
    sourceArrow: false,
    targetArrow: false,
    color: DEFAULT_CONNECTOR_COLOR,
  });
  const [connectorAppearanceOverrides, setConnectorAppearanceOverrides] = useState({});

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
  const validFreeConnections = useMemo(
    () => (freeConnections || []).filter((connection) => isValidFreeConnection(connection, nodeMetaById)),
    [freeConnections, nodeMetaById]
  );

  const getDraftLayout = useCallback(
    (nodeId) => draftNodeLayouts[nodeId] || null,
    [draftNodeLayouts]
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

  const contentBounds = useMemo(() => {
    const positions = flattenedNodes.map(({ node }) => {
      const position = getPosition(node);
      const width = getNodeWidth(node);
      const height = getEstimatedNodeHeight(nodeRects, node.id);

      return {
        left: position.x,
        top: position.y,
        right: position.x + width,
        bottom: position.y + height,
      };
    });

    if (!positions.length) {
      return {
        minX: 0,
        minY: 0,
        maxX: 1400 - CANVAS_PADDING * 2,
        maxY: 900 - CANVAS_PADDING * 2,
      };
    }

    return {
      minX: Math.min(0, ...positions.map((position) => position.left)),
      minY: Math.min(0, ...positions.map((position) => position.top)),
      maxX: Math.max(...positions.map((position) => position.right)),
      maxY: Math.max(...positions.map((position) => position.bottom)),
    };
  }, [flattenedNodes, getPosition, nodeRects]);

  const canvasSize = useMemo(() => {
    const contentWidth = Math.max(0, contentBounds.maxX - contentBounds.minX);
    const contentHeight = Math.max(0, contentBounds.maxY - contentBounds.minY);

    return {
      width: Math.max(1400, contentWidth + CANVAS_PADDING * 2),
      height: Math.max(900, contentHeight + CANVAS_PADDING * 2),
      contentWidth,
      contentHeight,
    };
  }, [contentBounds]);

  const canvasOffset = useMemo(() => {
    const x = CANVAS_PADDING - contentBounds.minX;
    const y = CANVAS_PADDING - contentBounds.minY;

    return { x, y };
  }, [contentBounds]);

  const getDisplayPosition = useCallback(
    (node) => {
      const position = getPosition(node);

      return {
        x: position.x + canvasOffset.x,
        y: position.y + canvasOffset.y,
      };
    },
    [canvasOffset, getPosition]
  );

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
    draftPositionsRef.current = draftPositions;
  }, [draftPositions]);

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
        const position = getDisplayPosition(node);
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
  }, [flattenedNodes, draftPositions, draftNodeLayouts, autoPositions, getDisplayPosition]);

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    document.body.classList.add("free-layout-dragging");

    const handleMouseMove = (event) => {
      event.preventDefault();

      const rawX = Math.max(
        Math.round(dragState.startPosition.x + event.clientX - dragState.startX)
      );
      const rawY = Math.round(dragState.startPosition.y + event.clientY - dragState.startY);
      const { position: snappedDisplayPosition, guides } = getDragSnapResult(
        dragState.node.id,
        {
          x: rawX + dragState.canvasOffset.x,
          y: rawY + dragState.canvasOffset.y,
        },
        nodeRects
      );
      const snappedPosition = {
        x: snappedDisplayPosition.x - dragState.canvasOffset.x,
        y: snappedDisplayPosition.y - dragState.canvasOffset.y,
      };

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
      const nextPosition =
        draftPositionsRef.current[dragState.node.id] || dragState.startPosition;
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
  }, [canvasOffset, dragState, draftPositions, nodeRects, onUpdateNodeLayout]);

  useEffect(() => {
    if (!resizeState) {
      return undefined;
    }

    document.body.classList.add("free-layout-resizing");

    const handleMouseMove = (event) => {
      event.preventDefault();

      const deltaX = event.clientX - resizeState.startX;
      const deltaY = event.clientY - resizeState.startY;
      const nextWidth = clamp(
        resizeState.startWidth +
          (resizeState.handle === "right" || resizeState.handle === "corner" ? deltaX : 0),
        MIN_NODE_WIDTH,
        MAX_NODE_WIDTH
      );
      const nextHeight = clamp(
        resizeState.startHeight +
          (resizeState.handle === "bottom" || resizeState.handle === "corner" ? deltaY : 0),
        MIN_NODE_HEIGHT,
        MAX_NODE_HEIGHT
      );
      const { layout: snappedLayout, guides } = getResizeSnapResult(
        resizeState.node.id,
        {
          nodeWidth: nextWidth,
          nodeMinHeight: nextHeight,
        },
        nodeRects,
        resizeState.handle
      );

      dragMovedRef.current = true;
      setDragGuides(guides);
      setDraftNodeLayouts((current) => ({
        ...current,
        [resizeState.node.id]: {
          ...(current[resizeState.node.id] || {}),
          nodeWidth: snappedLayout.nodeWidth,
          nodeMinHeight: snappedLayout.nodeMinHeight,
        },
      }));
    };

    const handleMouseUp = async () => {
      const nextLayout = draftNodeLayouts[resizeState.node.id];
      setResizeState(null);

      if (nextLayout) {
        suppressClickRef.current = true;
        await onUpdateNodeLayout(resizeState.node.id, {
          nodeWidth: nextLayout.nodeWidth,
          nodeMinHeight: nextLayout.nodeMinHeight,
        });
      }

      dragMovedRef.current = false;
      setDragGuides([]);
      setDraftNodeLayouts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[resizeState.node.id];
        return nextDrafts;
      });
    };

    const handleWindowBlur = () => {
      setResizeState(null);
      dragMovedRef.current = false;
      setDragGuides([]);
      setDraftNodeLayouts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[resizeState.node.id];
        return nextDrafts;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.body.classList.remove("free-layout-resizing");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [draftNodeLayouts, nodeRects, onUpdateNodeLayout, resizeState]);

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

        const connectableNodeIds = getConnectableNodeIds(current.nodeId, nodeMetaById);
        const { pointer, anchor } = getAnchorSelectionAtPointer({
          clientX: event.clientX,
          clientY: event.clientY,
          connectableNodeIds,
          nodeRects: nodeRectsRef.current,
          getCanvasPointer,
        });

        return {
          ...current,
          pointer,
          hoveredAnchor: anchor,
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

      const connectableNodeIds = getConnectableNodeIds(activeState.nodeId, nodeMetaById);
      const { anchor: targetAnchor } = getAnchorSelectionAtPointer({
        clientX: event.clientX,
        clientY: event.clientY,
        connectableNodeIds,
        nodeRects: nodeRectsRef.current,
        getCanvasPointer,
      });

      const sourceAnchor = {
        nodeId: activeState.nodeId,
        side: activeState.side,
      };
      const resolvedConnection = targetAnchor
        ? resolveConnectionSelection(sourceAnchor, targetAnchor, nodeMetaById, validFreeConnections)
        : null;
      const releasePointer =
        getCanvasPointer(event.clientX, event.clientY) || activeState.pointer;

      suppressClickRef.current = true;
      setConnectorDragState(null);

      if (!resolvedConnection) {
        if (releasePointer && onCreateNodeAtPosition) {
          setPendingNodeMenu({
            pointer: releasePointer,
            sourceNodeId: activeState.nodeId,
            sourceSide: activeState.side,
            editingConnectionId: activeState.editingConnectionId || null,
            editingConnectionType: activeState.editingConnectionType || null,
            editingRole: activeState.editingRole || null,
          });
        }
        return;
      }

      setPendingNodeMenu(null);

      if (resolvedConnection.type === "hierarchy") {
        await onUpdateNodeLayout(resolvedConnection.childNodeId, {
          connectorParentAnchor: resolvedConnection.parentAnchor,
          connectorChildAnchor: resolvedConnection.childAnchor,
          connectorHidden: false,
        });
        return;
      }

      await onUpdateFreeConnections((currentConnections) => {
        const nextConnections = (currentConnections || []).filter(
          (connection) =>
            getConnectionPairKey(connection.sourceNodeId, connection.targetNodeId) !==
            getConnectionPairKey(
              resolvedConnection.connection.sourceNodeId,
              resolvedConnection.connection.targetNodeId
            )
        );

        nextConnections.push(resolvedConnection.connection);
        return nextConnections;
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
  }, [
    connectorDragState,
    getCanvasPointer,
    nodeMetaById,
    onCreateNodeAtPosition,
    onUpdateFreeConnections,
    onUpdateNodeLayout,
    validFreeConnections,
  ]);

  

  const hierarchyConnectorConfigs = flattenedNodes
    .filter(({ node, parentId }) => parentId && node?.layout?.connectorHidden !== true)
    .map(({ node, parentId }) => {
      const childRect = nodeRects[node.id];
      const parentRect = nodeRects[parentId];

      if (!childRect || !parentRect) {
        return null;
      }

      return {
        id: `hierarchy:${parentId}-${node.id}`,
        type: "hierarchy",
        parentRect,
        childRect,
        parentNodeId: parentId,
        childNodeId: node.id,
        ...getConnectionAnchorPair(node, parentRect, childRect),
      };
    })
    .filter(Boolean);
  const freeLayoutConnectorConfigs = validFreeConnections
    .map((connection) => {
      const sourceRect = nodeRects[connection.sourceNodeId];
      const targetRect = nodeRects[connection.targetNodeId];

      if (!sourceRect || !targetRect) {
        return null;
      }

      return {
        id: `free:${connection.id}`,
        type: "free",
        connectionId: connection.id,
        sourceRect,
        targetRect,
        sourceSide: connection.sourceAnchor,
        targetSide: connection.targetAnchor,
        sourceNodeId: connection.sourceNodeId,
        targetNodeId: connection.targetNodeId,
        color: connection.color,
        lineStyle: connection.lineStyle,
        sourceArrow: connection.sourceArrow,
        targetArrow: connection.targetArrow,
      };
    })
    .filter(Boolean);
  const connectorEndpointLayout = buildConnectorEndpointLayout([
    ...hierarchyConnectorConfigs.flatMap((connector) => [
      {
        endpointKey: `${connector.id}:parent`,
        nodeId: connector.parentNodeId,
        side: connector.start.side,
      },
      {
        endpointKey: `${connector.id}:child`,
        nodeId: connector.childNodeId,
        side: connector.end.side,
      },
    ]),
    ...freeLayoutConnectorConfigs.flatMap((connector) => [
      {
        endpointKey: `${connector.id}:source`,
        nodeId: connector.sourceNodeId,
        side: connector.sourceSide,
      },
      {
        endpointKey: `${connector.id}:target`,
        nodeId: connector.targetNodeId,
        side: connector.targetSide,
      },
    ]),
  ]);
  const hierarchyConnectors = hierarchyConnectorConfigs.map((connector) => {
    const appearanceOverride = connectorAppearanceOverrides[connector.id] || null;
    const startBundlePoint = shouldBundleNodeSide(
      connectorEndpointLayout.endpointGroups,
      connector.parentNodeId,
      connector.start.side
    )
      ? getSideBundlePoint(connector.parentRect, connector.start.side)
      : null;
    const endBundlePoint = shouldBundleNodeSide(
      connectorEndpointLayout.endpointGroups,
      connector.childNodeId,
      connector.end.side
    )
      ? getSideBundlePoint(connector.childRect, connector.end.side)
      : null;
    const start = getConnectorRouteAnchor(
      connector.parentRect,
      connector.start.side,
      connectorEndpointLayout.endpointGroups,
      connector.parentNodeId,
      getConnectorEndpointAssignment(
        connectorEndpointLayout.endpointAssignments,
        `${connector.id}:parent`
      )
    );
    const end = getConnectorRouteAnchor(
      connector.childRect,
      connector.end.side,
      connectorEndpointLayout.endpointGroups,
      connector.childNodeId,
      getConnectorEndpointAssignment(
        connectorEndpointLayout.endpointAssignments,
        `${connector.id}:child`
      )
    );
    const obstacles = Object.entries(nodeRects)
      .filter(([id]) => id !== connector.childNodeId && id !== connector.parentNodeId)
      .map(([, rect]) => expandRect(toFullRect(rect), OBSTACLE_PADDING));
    const connectorPath = buildOrthogonalConnector(start, end, obstacles, canvasSize, {
      startBundlePoint,
      endBundlePoint,
    });
    const isPendingConnector =
      connectorDragState &&
      (connectorDragState.nodeId === connector.childNodeId ||
        connectorDragState.nodeId === connector.parentNodeId);

    return {
      id: connector.id,
      type: connector.type,
      d: connectorPath.d,
      parentSide: start.side,
      childSide: end.side,
      start,
      end,
      parentNodeId: connector.parentNodeId,
      childNodeId: connector.childNodeId,
      manual: connector.manual,
      pending: Boolean(isPendingConnector),
      actionX: connectorPath.midpoint.x,
      actionY: connectorPath.midpoint.y,
      color:
        appearanceOverride?.color ||
        (connector.childNodeId
          ? nodeMetaById[connector.childNodeId]?.node?.layout?.connectorColor
          : undefined),
      lineStyle:
        appearanceOverride?.lineStyle ||
        (connector.childNodeId
          ? nodeMetaById[connector.childNodeId]?.node?.layout?.connectorLineStyle
          : undefined),
      sourceArrow:
        appearanceOverride?.sourceArrow ??
        (connector.childNodeId
          ? nodeMetaById[connector.childNodeId]?.node?.layout?.connectorParentArrow
          : undefined),
      targetArrow:
        appearanceOverride?.targetArrow ??
        (connector.childNodeId
          ? nodeMetaById[connector.childNodeId]?.node?.layout?.connectorChildArrow
          : undefined),
    };
  });
  const freeLayoutConnectors = freeLayoutConnectorConfigs
    .map((connector) => {
      const appearanceOverride = connectorAppearanceOverrides[connector.id] || null;
      const startBundlePoint = shouldBundleNodeSide(
        connectorEndpointLayout.endpointGroups,
        connector.sourceNodeId,
        connector.sourceSide
      )
        ? getSideBundlePoint(connector.sourceRect, connector.sourceSide)
        : null;
      const endBundlePoint = shouldBundleNodeSide(
        connectorEndpointLayout.endpointGroups,
        connector.targetNodeId,
        connector.targetSide
      )
        ? getSideBundlePoint(connector.targetRect, connector.targetSide)
        : null;
      const start = getConnectorRouteAnchor(
        connector.sourceRect,
        connector.sourceSide,
        connectorEndpointLayout.endpointGroups,
        connector.sourceNodeId,
        getConnectorEndpointAssignment(
          connectorEndpointLayout.endpointAssignments,
          `${connector.id}:source`
        )
      );
      const end = getConnectorRouteAnchor(
        connector.targetRect,
        connector.targetSide,
        connectorEndpointLayout.endpointGroups,
        connector.targetNodeId,
        getConnectorEndpointAssignment(
          connectorEndpointLayout.endpointAssignments,
          `${connector.id}:target`
        )
      );

      if (!start || !end) {
        return null;
      }

      const obstacles = Object.entries(nodeRects)
        .filter(
          ([id]) => id !== connector.sourceNodeId && id !== connector.targetNodeId
        )
        .map(([, rect]) => expandRect(toFullRect(rect), OBSTACLE_PADDING));
      const connectorPath = buildOrthogonalConnector(start, end, obstacles, canvasSize, {
        startBundlePoint,
        endBundlePoint,
      });
      const isPendingConnector =
        connectorDragState &&
        (connectorDragState.nodeId === connector.sourceNodeId ||
          connectorDragState.nodeId === connector.targetNodeId);

      return {
        id: connector.id,
        type: connector.type,
        connectionId: connector.connectionId,
        d: connectorPath.d,
        sourceSide: connector.sourceSide,
        targetSide: connector.targetSide,
        start,
        end,
        sourceNodeId: connector.sourceNodeId,
        targetNodeId: connector.targetNodeId,
        manual: true,
        pending: Boolean(isPendingConnector),
        actionX: connectorPath.midpoint.x,
        actionY: connectorPath.midpoint.y,
        color: appearanceOverride?.color || connector.color,
        lineStyle: appearanceOverride?.lineStyle || connector.lineStyle,
        sourceArrow: appearanceOverride?.sourceArrow ?? connector.sourceArrow,
        targetArrow: appearanceOverride?.targetArrow ?? connector.targetArrow,
      };
    })
    .filter(Boolean);
  const connectors = [...hierarchyConnectors, ...freeLayoutConnectors];

  const previewConnector = useMemo(() => {
    if (!connectorDragState) {
      return null;
    }

    const sourceRect = nodeRects[connectorDragState.nodeId];

    if (!sourceRect) {
      return null;
    }

    const editingEndpointKey =
      connectorDragState.editingConnectionId && connectorDragState.editingRole
        ? `${connectorDragState.editingConnectionId}:${connectorDragState.editingRole}`
        : null;
    const sourceAnchor = getConnectorRouteAnchor(
      sourceRect,
      connectorDragState.side,
      connectorEndpointLayout.endpointGroups,
      connectorDragState.nodeId,
      editingEndpointKey
        ? getConnectorEndpointAssignment(
            connectorEndpointLayout.endpointAssignments,
            editingEndpointKey
          )
        : {
            index: getNodeSideEndpointCount(
              connectorEndpointLayout.endpointGroups,
              connectorDragState.nodeId,
              connectorDragState.side
            ),
            total:
              getNodeSideEndpointCount(
                connectorEndpointLayout.endpointGroups,
                connectorDragState.nodeId,
                connectorDragState.side
              ) + 1,
          }
    );
    let targetAnchor;
    const sourceBundlePoint =
      getNodeSideEndpointCount(
        connectorEndpointLayout.endpointGroups,
        connectorDragState.nodeId,
        connectorDragState.side
      ) > 1
        ? getSideBundlePoint(sourceRect, connectorDragState.side)
        : null;
    let targetBundlePoint = null;

    if (connectorDragState.hoveredAnchor?.nodeId) {
      const hoveredRect = nodeRects[connectorDragState.hoveredAnchor.nodeId];

      if (hoveredRect) {
        const targetSideCount = getNodeSideEndpointCount(
          connectorEndpointLayout.endpointGroups,
          connectorDragState.hoveredAnchor.nodeId,
          connectorDragState.hoveredAnchor.side
        );

        targetAnchor = getConnectorRouteAnchor(
          hoveredRect,
          connectorDragState.hoveredAnchor.side,
          connectorEndpointLayout.endpointGroups,
          connectorDragState.hoveredAnchor.nodeId,
          {
            index: targetSideCount,
            total: targetSideCount + 1,
          }
        );
        if (targetSideCount > 0) {
          targetBundlePoint = getSideBundlePoint(
            hoveredRect,
            connectorDragState.hoveredAnchor.side
          );
        }
      }
    }

    if (!targetAnchor) {
      if (!connectorDragState.pointer) {
        return null;
      }

      // Force an orthogonal preview direction based on pointer delta
      const deltaX = connectorDragState.pointer.x - sourceAnchor.x;
      const deltaY = connectorDragState.pointer.y - sourceAnchor.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      const dx = absX > absY ? Math.sign(deltaX) : 0;
      const dy = dx === 0 ? (deltaY === 0 ? sourceAnchor.dy : Math.sign(deltaY)) : 0;

      targetAnchor = {
        x: connectorDragState.pointer.x,
        y: connectorDragState.pointer.y,
        dx,
        dy,
      };
    }

    const targetNodeId = connectorDragState.hoveredAnchor?.nodeId;
    const obstacles = Object.entries(nodeRects)
      .filter(([id]) => id !== connectorDragState.nodeId && id !== targetNodeId)
      .map(([, rect]) => expandRect(toFullRect(rect), OBSTACLE_PADDING));

    return buildOrthogonalConnector(sourceAnchor, targetAnchor, obstacles, canvasSize, {
      startBundlePoint: sourceBundlePoint,
      endBundlePoint: targetBundlePoint,
    }).d;
  }, [canvasSize, connectorDragState, connectorEndpointLayout, nodeRects]);

  const handleCanvasMouseDown = (event) => {
    if (event.target.closest(".oc-node, .free-layout-anchor, .free-layout-resize-handle")) {
      return;
    }

    setConnectorDragState(null);
    setHoveredConnectorId(null);
    setHoveredResizeNodeId(null);
    setPendingNodeMenu(null);
    setCanvasContextMenu(null);
  };

  const showConnectorActions = useCallback((connectorId) => {
    if (hoveredConnectorTimeoutRef.current) {
      window.clearTimeout(hoveredConnectorTimeoutRef.current);
      hoveredConnectorTimeoutRef.current = null;
    }

    setHoveredConnectorId(connectorId);
  }, []);

  const hideConnectorActions = useCallback((connectorId) => {
    if (hoveredConnectorTimeoutRef.current) {
      window.clearTimeout(hoveredConnectorTimeoutRef.current);
    }

    hoveredConnectorTimeoutRef.current = window.setTimeout(() => {
      setHoveredConnectorId((current) => (current === connectorId ? null : current));
      hoveredConnectorTimeoutRef.current = null;
    }, 220);
  }, []);

  useEffect(() => {
    return () => {
      if (hoveredConnectorTimeoutRef.current) {
        window.clearTimeout(hoveredConnectorTimeoutRef.current);
      }
    };
  }, []);

  const handleCanvasContextMenu = (event) => {
    if (!contentEditable) {
      return;
    }

    if (
      event.target.closest(
        ".oc-node, .free-layout-anchor, .free-layout-resize-handle, .connector-group, .free-layout-node-menu"
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    onCloseContextMenu?.();
    setPendingNodeMenu(null);
    setConnectorDragState(null);
    setHoveredConnectorId(null);
    setHoveredResizeNodeId(null);
    setCanvasContextMenu({
      pointer: getCanvasPointer(event.clientX, event.clientY),
    });
  };

  const handleConnectorRemove = async (event, connector) => {
    event.preventDefault();
    event.stopPropagation();

    setHoveredConnectorId(null);
    setCanvasContextMenu(null);

    if (connector.type === "free") {
      await onUpdateFreeConnections((currentConnections) =>
        (currentConnections || []).filter(
          (connection) => connection.id !== connector.connectionId
        )
      );
      return;
    }

    await onUpdateNodeLayout(connector.childNodeId, {
      connectorParentAnchor: null,
      connectorChildAnchor: null,
      connectorHidden: true,
    });
  };

  const handleConnectorEditOpen = (event, connector) => {
    event.preventDefault();
    event.stopPropagation();

    const appearance = getConnectorAppearance(connector);
    setCanvasContextMenu(null);
    setEditingConnector(connector);
    setConnectorEditorValues({
      sourceArrow: appearance.sourceArrow,
      targetArrow: appearance.targetArrow,
      color: appearance.color,
    });
  };

  const handleConnectorEditSave = async () => {
    if (!editingConnector) {
      return;
    }

    const editingConnectorId = editingConnector.id;
    const nextAppearance = {
      sourceArrow: connectorEditorValues.sourceArrow,
      targetArrow: connectorEditorValues.targetArrow,
      color: connectorEditorValues.color,
    };

    setConnectorAppearanceOverrides((current) => ({
      ...current,
      [editingConnectorId]: nextAppearance,
    }));

    if (editingConnector.type === "free") {
      await onUpdateFreeConnections((currentConnections) =>
        (currentConnections || []).map((connection) =>
          connection.id === editingConnector.connectionId
            ? {
                ...connection,
                sourceArrow: connectorEditorValues.sourceArrow,
                targetArrow: connectorEditorValues.targetArrow,
                color: connectorEditorValues.color,
              }
            : connection
        )
      );
    } else {
      await onUpdateNodeLayout(editingConnector.childNodeId, {
        connectorParentArrow: connectorEditorValues.sourceArrow,
        connectorChildArrow: connectorEditorValues.targetArrow,
        connectorColor: connectorEditorValues.color,
      });
    }

    setEditingConnector(null);
  };

  const handleAnchorMouseDown = (event, nodeMeta, side) => {
    if (!contentEditable || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    onCloseContextMenu?.();
    setPendingNodeMenu(null);
    setCanvasContextMenu(null);
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

  const handleConnectorMouseDown = (event, connector, role = "source") => {
    if (!contentEditable || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    onCloseContextMenu?.();
    setPendingNodeMenu(null);
    setCanvasContextMenu(null);
    dragMovedRef.current = false;
    suppressClickRef.current = false;

    // Determine starting node and side depending on connector type and role
    const canvasPointer = getCanvasPointer(event.clientX, event.clientY);

    if (connector.type === "free") {
      // choose closer end (start or end)
      const distStart = Math.hypot(canvasPointer.x - connector.start.x, canvasPointer.y - connector.start.y);
      const distEnd = Math.hypot(canvasPointer.x - connector.end.x, canvasPointer.y - connector.end.y);
      const useStart = distStart <= distEnd;

      setConnectorDragState({
        nodeId: useStart ? connector.sourceNodeId : connector.targetNodeId,
        side: useStart ? connector.sourceSide : connector.targetSide,
        pointer: canvasPointer,
        hoveredAnchor: null,
        editingConnectionId: connector.connectionId,
        editingConnectionType: connector.type,
        editingRole: useStart ? "source" : "target",
      });

      return;
    }

    if (connector.type === "hierarchy") {
      // pick closer end (parent or child)
      const distStart = Math.hypot(canvasPointer.x - connector.start.x, canvasPointer.y - connector.start.y);
      const distEnd = Math.hypot(canvasPointer.x - connector.end.x, canvasPointer.y - connector.end.y);
      const useChild = distEnd <= distStart;

      setConnectorDragState({
        nodeId: useChild ? connector.childNodeId : connector.parentNodeId,
        side: useChild ? connector.childSide : connector.parentSide,
        pointer: canvasPointer,
        hoveredAnchor: null,
        editingConnectionId: connector.id,
        editingConnectionType: connector.type,
        editingRole: useChild ? "child" : "parent",
      });

      return;
    }
  };

  const handleNodeMouseDown = (event, node) => {
    if (!contentEditable || event.button !== 0) {
      return;
    }

    if (event.target.closest("button, input, textarea, select, a, .free-layout-resize-handle")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    onCloseContextMenu?.();
    setPendingNodeMenu(null);
    setCanvasContextMenu(null);
    setConnectorDragState(null);
    dragMovedRef.current = false;
    setDragState({
      node,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: getPosition(node),
      canvasOffset,
    });
  };

  const handleResizeMouseDown = (event, node, handle) => {
    if (!contentEditable || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setPendingNodeMenu(null);
    const measuredRect = nodeRects[node.id];
    const startWidth = node?.layout?.nodeWidth || measuredRect?.width || 224;
    const startHeight =
      node?.layout?.nodeMinHeight && node.layout.nodeMinHeight > 0
        ? node.layout.nodeMinHeight
        : measuredRect?.height || 160;

    onCloseContextMenu?.();
    setConnectorDragState(null);
    setDragState(null);
    setCanvasContextMenu(null);
    dragMovedRef.current = false;
    setResizeState({
      node,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startWidth,
      startHeight,
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
    event.stopPropagation();

    setPendingNodeMenu(null);
    setCanvasContextMenu(null);

    if (onClickNode) {
      onClickNode(node, { openSidebar: false });
    }

    if (contentEditable) {
      selectNodeService.sendSelectedNodeInfo(node.id);
    }

    onContextMenu?.(event);
  };

  const handlePendingNodeCreate = async () => {
    if (!pendingNodeMenu || !onCreateNodeAtPosition) {
      return;
    }

    const nextPendingNodeMenu = pendingNodeMenu;
    const sourceRect = nodeRects[nextPendingNodeMenu.sourceNodeId];
    const sourceAnchor = sourceRect
      ? getAnchorsFromRect(sourceRect)[nextPendingNodeMenu.sourceSide]
      : null;
    const targetAnchor = getTargetAnchorSideForNewNode(
      sourceAnchor,
      nextPendingNodeMenu.pointer
    );
    setPendingNodeMenu(null);

    const createdNode = await onCreateNodeAtPosition({
      position: {
        x: nextPendingNodeMenu.pointer.x - canvasOffset.x - 112,
        y: nextPendingNodeMenu.pointer.y - canvasOffset.y - 80,
      },
      connectionDraft: {
        sourceNodeId: nextPendingNodeMenu.sourceNodeId,
        sourceAnchor: nextPendingNodeMenu.sourceSide,
        targetAnchor,
        editingConnectionId: nextPendingNodeMenu.editingConnectionId,
        editingConnectionType: nextPendingNodeMenu.editingConnectionType,
        editingRole: nextPendingNodeMenu.editingRole,
      },
    });

    if (createdNode?.id) {
      selectNodeService.sendSelectedNodeInfo(createdNode.id);
      onClickNode?.(createdNode);
    }
  };

  const handleCanvasMenuCreate = async (kind = "organisation") => {
    if (!canvasContextMenu || !onCreateNodeAtPosition) {
      return;
    }

    const nextMenu = canvasContextMenu;
    setCanvasContextMenu(null);

    const createdNode = await onCreateNodeAtPosition({
      position: {
        x: nextMenu.pointer.x - 112,
        y: nextMenu.pointer.y - 80,
      },
      kind,
    });

    if (createdNode?.id) {
      selectNodeService.sendSelectedNodeInfo(createdNode.id);
      onClickNode?.(createdNode);
    }
  };

  const handleCanvasMenuPaste = async () => {
    if (!canvasContextMenu || !onPasteNodeAtPosition) {
      return;
    }

    const nextMenu = canvasContextMenu;
    setCanvasContextMenu(null);

    const pastedNode = await onPasteNodeAtPosition({
      position: {
        x: nextMenu.pointer.x - 112,
        y: nextMenu.pointer.y - 80,
      },
    });

    if (pastedNode?.id) {
      selectNodeService.sendSelectedNodeInfo(pastedNode.id);
      onClickNode?.(pastedNode);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="free-layout-canvas"
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={handleCanvasContextMenu}
      style={{
        width: `${canvasSize.width}px`,
        height: `${canvasSize.height}px`,
      }}
    >
      <svg className="free-layout-connectors" aria-hidden="true">
        <defs>
          <marker
            id="connector-arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="6.8"
            refY="4"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L 8 4 L 0 8 L 1.6 4 z" fill="context-stroke" stroke="none" />
          </marker>
        </defs>
        {connectors.map((connector) => (
          (() => {
            const appearance = getConnectorAppearance(connector);

            return (
              <g
                key={getConnectorRenderKey(connector, appearance)}
                className="connector-group"
                onMouseEnter={() => showConnectorActions(connector.id)}
                onMouseLeave={() => hideConnectorActions(connector.id)}
              >
                <path
                  className={`connector-hit-area ${connector.manual ? "manual" : "auto"}${
                    connector.pending ? " pending" : ""
                  }`}
                  d={connector.d}
                  onMouseEnter={() => showConnectorActions(connector.id)}
                  onMouseDown={(e) => handleConnectorMouseDown(e, connector)}
                />
                <path
                  className={`connector-line ${connector.manual ? "manual" : "auto"}${
                    connector.pending ? " pending" : ""
                  }`}
                  d={connector.d}
                  stroke={appearance.color}
                  strokeLinecap="round"
                  markerStart={appearance.sourceArrow ? "url(#connector-arrowhead)" : undefined}
                  markerEnd={appearance.targetArrow ? "url(#connector-arrowhead)" : undefined}
                />
            
            {hoveredConnectorId === connector.id && contentEditable && (
              <>
                <g
                  className="connector-edit-button"
                  transform={`translate(${connector.actionX - 15}, ${connector.actionY})`}
                  onMouseEnter={() => showConnectorActions(connector.id)}
                  onMouseLeave={() => hideConnectorActions(connector.id)}
                  onMouseDown={(event) => handleConnectorEditOpen(event, connector)}
                >
                  <circle r="12" />
                  <path d="M -3 3 L 3 -3 M -1 -4 L 4 1 M -4 4 L -1 1" />
                </g>
                <g
                  className="connector-remove-button"
                  transform={`translate(${connector.actionX + 15}, ${connector.actionY})`}
                  onMouseEnter={() => showConnectorActions(connector.id)}
                  onMouseLeave={() => hideConnectorActions(connector.id)}
                  onMouseDown={(event) => handleConnectorRemove(event, connector)}
                >
                  <circle r="12" />
                  <path d="M -4 -4 L 4 4 M 4 -4 L -4 4" />
                </g>
              </>
            )}
              </g>
            );
          })()
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
      {pendingNodeMenu && (
        <div
          className="free-layout-node-menu"
          style={{
            left: `${pendingNodeMenu.pointer.x}px`,
            top: `${pendingNodeMenu.pointer.y}px`,
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              handlePendingNodeCreate();
            }}
          >
            Node Hinzufügen
          </button>
        </div>
      )}
      {canvasContextMenu && (
        <div
          className="free-layout-node-menu free-layout-canvas-menu"
          style={{
            left: `${canvasContextMenu.pointer.x}px`,
            top: `${canvasContextMenu.pointer.y}px`,
            transform: "translate(0, 0)",
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => handleCanvasMenuCreate("organisation")}>
            Node erstellen
          </button>
          <button
            type="button"
            onClick={handleCanvasMenuPaste}
            disabled={!canPasteAtPosition}
          >
            Aus Zwischenablage einfügen
          </button>
          <button type="button" onClick={() => handleCanvasMenuCreate("note")}>
            Notiz erstellen
          </button>
        </div>
      )}
      <Modal show={Boolean(editingConnector)} onHide={() => setEditingConnector(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Verbindung bearbeiten</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Check
                type="switch"
                id="connector-source-arrow"
                label="Pfeil an Quelle anzeigen"
                checked={connectorEditorValues.sourceArrow}
                onChange={(event) =>
                  setConnectorEditorValues((current) => ({
                    ...current,
                    sourceArrow: event.target.checked,
                  }))
                }
              />
              <Form.Check
                type="switch"
                id="connector-target-arrow"
                label="Pfeil an Ziel anzeigen"
                checked={connectorEditorValues.targetArrow}
                onChange={(event) =>
                  setConnectorEditorValues((current) => ({
                    ...current,
                    targetArrow: event.target.checked,
                  }))
                }
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Farbe</Form.Label>
              <Form.Control
                type="color"
                value={connectorEditorValues.color}
                onChange={(event) =>
                  setConnectorEditorValues((current) => ({
                    ...current,
                    color: event.target.value,
                  }))
                }
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditingConnector(null)}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={handleConnectorEditSave}>
            Speichern
          </Button>
        </Modal.Footer>
      </Modal>
      <ul className="free-layout-list">
        {flattenedNodes.map((nodeMeta) => {
          const { node, level } = nodeMeta;
          const noteNode = isNoteNode(node);
          const position = getDisplayPosition(node);
          const draftLayout = getDraftLayout(node.id);
          const renderedNode = draftLayout
            ? {
                ...node,
                layout: {
                  ...(node.layout || {}),
                  ...draftLayout,
                },
              }
            : node;
          const isDragging = dragState?.node?.id === node.id;
          const isResizing = resizeState?.node?.id === node.id;
          const isResizeHovered = hoveredResizeNodeId === node.id;
          const isPendingNode = connectorDragState?.nodeId === node.id;
          const isHoveredTarget = connectorDragState?.hoveredAnchor?.nodeId === node.id;
          const isConnectableNode = Boolean(
            connectorDragState && connectorDragState.nodeId !== node.id && !noteNode
          );
          const showAnchors =
            !noteNode &&
            contentEditable &&
            (selectedNodeId === node.id ||
              isDragging ||
              isResizing ||
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
                  (noteNode ? " note-node" : "") +
                  (node.layout?.style ? ` ${node.layout.style}` : "") +
                  (isDragging ? " position-dragging" : "") +
                  (isResizing ? " position-dragging" : "") +
                  (node.organisations && node.organisations.length > 0
                    ? node.organisations.length > 1
                      ? " has-children"
                      : " has-child"
                    : " end-node")
                }
                onClick={(event) => handleNodeClick(event, node)}
                onMouseDown={(event) => handleNodeMouseDown(event, node)}
                onMouseEnter={() => setHoveredResizeNodeId(node.id)}
                onMouseLeave={() =>
                  setHoveredResizeNodeId((current) => (current === node.id ? null : current))
                }
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
                {contentEditable && (isResizeHovered || isResizing) && (
                  <>
                    <button
                      type="button"
                      className="free-layout-resize-handle right"
                      style={{
                        position: "absolute",
                        top: "12px",
                        right: "-6px",
                        width: "12px",
                        height: "calc(100% - 24px)",
                        cursor: "col-resize",
                        background: "transparent",
                        border: 0,
                        zIndex: 6,
                      }}
                      onMouseDown={(event) => handleResizeMouseDown(event, node, "right")}
                      aria-label={`${node.name || node.id}: Breite anpassen`}
                      title="Breite anpassen"
                    />
                    <button
                      type="button"
                      className="free-layout-resize-handle bottom"
                      style={{
                        position: "absolute",
                        left: "12px",
                        bottom: "-6px",
                        width: "calc(100% - 24px)",
                        height: "12px",
                        cursor: "row-resize",
                        background: "transparent",
                        border: 0,
                        zIndex: 6,
                      }}
                      onMouseDown={(event) => handleResizeMouseDown(event, node, "bottom")}
                      aria-label={`${node.name || node.id}: Höhe anpassen`}
                      title="Höhe anpassen"
                    />
                    <button
                      type="button"
                      className="free-layout-resize-handle corner"
                      style={{
                        position: "absolute",
                        right: "-6px",
                        bottom: "-6px",
                        width: "14px",
                        height: "14px",
                        cursor: "nwse-resize",
                        background: "#132458",
                        border: "2px solid #ffffff",
                        borderRadius: "50%",
                        zIndex: 7,
                        boxShadow: "0 0 0 1px rgba(19, 36, 88, 0.2)",
                      }}
                      onMouseDown={(event) => handleResizeMouseDown(event, node, "corner")}
                      aria-label={`${node.name || node.id}: Größe anpassen`}
                      title="Größe anpassen"
                    />
                  </>
                )}
                <ChartNodeCard data={renderedNode} />
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