const LEVEL_GAP = 220;
const SIBLING_GAP = 56;
const START_X = 80;
const START_Y = 40;
const CONNECTOR_ANCHOR_SIDES = ["top", "right", "bottom", "left"];

const isValidAnchorSide = (side) => CONNECTOR_ANCHOR_SIDES.includes(side);

const getConnectionPairKey = (firstNodeId, secondNodeId) =>
  [firstNodeId, secondNodeId].sort().join("::");

const getNodeWidth = (node) => node?.layout?.nodeWidth || 224;

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

const chooseAnchorSides = (parentPosition, childPosition) => {
  const deltaX = (childPosition?.x || 0) - (parentPosition?.x || 0);
  const deltaY = (childPosition?.y || 0) - (parentPosition?.y || 0);

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX >= 0
      ? { sourceAnchor: "right", targetAnchor: "left" }
      : { sourceAnchor: "left", targetAnchor: "right" };
  }

  return deltaY >= 0
    ? { sourceAnchor: "bottom", targetAnchor: "top" }
    : { sourceAnchor: "top", targetAnchor: "bottom" };
};

const normalizeFreeLayoutNode = (node, position) => {
  const nextLayout = {
    ...(node.layout || {}),
    positionMode: "manual",
    x:
      Number.isFinite(node?.layout?.x) && node?.layout?.positionMode === "manual"
        ? node.layout.x
        : position?.x || START_X,
    y:
      Number.isFinite(node?.layout?.y) && node?.layout?.positionMode === "manual"
        ? node.layout.y
        : position?.y || START_Y,
  };

  delete nextLayout.connectorParentAnchor;
  delete nextLayout.connectorChildAnchor;
  delete nextLayout.connectorHidden;

  return {
    ...node,
    organisations: [],
    layout: nextLayout,
  };
};

const collectNodeIdsRecursive = (node, ids = []) => {
  if (!node?.id) {
    return ids;
  }

  ids.push(node.id);
  (node.organisations || []).forEach((child) => collectNodeIdsRecursive(child, ids));
  return ids;
};

export const collectSubtreeNodeIds = (node) => collectNodeIdsRecursive(node, []);

export const removeConnectionsForNodeIds = (freeConnections = [], removedNodeIds = []) => {
  const removedNodeIdSet = new Set(removedNodeIds);

  return (freeConnections || []).filter(
    (connection) =>
      !removedNodeIdSet.has(connection.sourceNodeId) &&
      !removedNodeIdSet.has(connection.targetNodeId)
  );
};

export const convertDocumentToFreeLayout = (data = {}) => {
  const organisations = Array.isArray(data.organisations) ? data.organisations : [];
  const positions = buildAutoPositions(organisations);
  const flattenedNodes = [];
  const existingConnections = Array.isArray(data?.document?.freeConnections)
    ? data.document.freeConnections
    : [];
  const existingConnectionKeys = new Set(
    existingConnections.map((connection) =>
      getConnectionPairKey(connection.sourceNodeId, connection.targetNodeId)
    )
  );
  const generatedConnections = [];

  const flattenNode = (node, parentNode = null) => {
    const nodePosition = positions[node.id];

    flattenedNodes.push(normalizeFreeLayoutNode(node, nodePosition));

    if (parentNode && node?.layout?.connectorHidden !== true) {
      const pairKey = getConnectionPairKey(parentNode.id, node.id);

      if (!existingConnectionKeys.has(pairKey)) {
        const fallbackAnchors = chooseAnchorSides(
          positions[parentNode.id],
          positions[node.id]
        );

        generatedConnections.push({
          id: `free-connection-${pairKey}`,
          sourceNodeId: parentNode.id,
          targetNodeId: node.id,
          sourceAnchor: isValidAnchorSide(node?.layout?.connectorParentAnchor)
            ? node.layout.connectorParentAnchor
            : fallbackAnchors.sourceAnchor,
          targetAnchor: isValidAnchorSide(node?.layout?.connectorChildAnchor)
            ? node.layout.connectorChildAnchor
            : fallbackAnchors.targetAnchor,
        });
      }
    }

    (node.organisations || []).forEach((child) => flattenNode(child, node));
  };

  organisations.forEach((node) => flattenNode(node));

  return {
    ...data,
    document: {
      ...(data.document || {}),
      layoutMode: "free",
      freeConnections: [...existingConnections, ...generatedConnections],
    },
    organisations: flattenedNodes,
  };
};