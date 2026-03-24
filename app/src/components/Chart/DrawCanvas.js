import React, { useEffect, useState, useRef } from "react";

const collectNodes = (root) => {
  const list = [];
  const walk = (n, level = 0, parentId = null) => {
    list.push({ id: n.id, name: n.name, level, parentId, layout: n.layout || {} });
    if (n.organisations && n.organisations.length > 0) {
      n.organisations.forEach((c) => walk(c, level + 1, n.id));
    }
  };
  walk(root, 0, null);
  return list;
};

const DrawCanvas = ({ node, onNodePositionChange }) => {
  const paperRef = useRef(null);
  const nodes = collectNodes(node);

  const initialPositions = {};
  nodes.forEach((n, idx) => {
    const offsetX = n.layout?.offsetX ?? idx * 220;
    const offsetY = n.layout?.offsetY ?? n.level * 160;
    initialPositions[n.id] = { x: offsetX, y: offsetY };
  });

  const [positions, setPositions] = useState(initialPositions);
  const dragRef = useRef(null);

  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      nodes.forEach((n, idx) => {
        if (!(n.id in next)) {
          next[n.id] = { x: n.layout?.offsetX ?? idx * 220, y: n.layout?.offsetY ?? n.level * 160 };
        }
      });
      return next;
    });
  }, [node]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      setPositions((prev) => ({ ...prev, [d.id]: { x: d.origX + dx, y: d.origY + dy } }));
    };
    const handleMouseUp = async (e) => {
      const d = dragRef.current;
      if (!d) return;
      const final = positions[d.id];
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      // persist
      if (typeof onNodePositionChange === "function") {
        await onNodePositionChange(d.id, { offsetX: Math.round(final.x), offsetY: Math.round(final.y) });
      }
    };
    if (dragRef.current) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [positions, onNodePositionChange]);

  const startDrag = (e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = paperRef.current.getBoundingClientRect();
    const orig = positions[id];
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: orig.x, origY: orig.y, rect };
  };

  const renderEdges = () => {
    const edges = [];
    const byId = {};
    nodes.forEach((n) => (byId[n.id] = n));
    nodes.forEach((n) => {
      if (n.parentId) {
        const p = positions[n.parentId];
        const c = positions[n.id];
        if (p && c) {
          const x1 = p.x + 100;
          const y1 = p.y + 30;
          const x4 = c.x + 100;
          const y4 = c.y + 30;
          const midY = (y1 + y4) / 2;
          edges.push(`M ${x1} ${y1} L ${x1} ${midY} L ${x4} ${midY} L ${x4} ${y4}`);
        }
      }
    });
    return edges.map((d, i) => <path key={i} d={d} fill="none" stroke="#6c757d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="miter" />);
  };

  return (
    <div className="drawio-overlay" ref={paperRef} style={{ position: "absolute", inset: 0, zIndex: 50 }}>
      <svg width="100%" height="100%">
        <g className="edges">{renderEdges()}</g>
        <g className="nodes">
          {nodes.map((n) => {
            const pos = positions[n.id] || { x: 0, y: 0 };
            return (
              <g key={n.id} transform={`translate(${pos.x}, ${pos.y})`} onMouseDown={(e) => startDrag(e, n.id)} style={{ cursor: "grab" }}>
                <rect x={0} y={0} width={200} height={60} rx={6} fill="#ffffff" stroke="#6c757d" />
                <text x={12} y={28} style={{ fontSize: 14, fill: "#222" }}>{n.name}</text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default DrawCanvas;
