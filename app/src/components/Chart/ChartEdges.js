import React, { useEffect, useState } from "react";

const ChartEdges = ({ node, paperRef }) => {
  const [edges, setEdges] = useState([]);

  const collectPairs = (n) => {
    const pairs = [];
    const walk = (parent) => {
      if (!parent || !parent.organisations) return;
      parent.organisations.forEach((child) => {
        pairs.push({ parentId: parent.id, childId: child.id });
        walk(child);
      });
    };
    walk(n);
    return pairs;
  };

  const computeEdges = () => {
    try {
      const paperRect = paperRef && paperRef.current && paperRef.current.getBoundingClientRect();
      if (!paperRect) return setEdges([]);

      const pairs = collectPairs(node);
      const newEdges = pairs
        .map(({ parentId, childId }) => {
          const parentEl = document.getElementById(parentId);
          const childEl = document.getElementById(childId);
          if (!parentEl || !childEl) return null;

          const pRect = parentEl.getBoundingClientRect();
          const cRect = childEl.getBoundingClientRect();

          const parentBottom = pRect.bottom - paperRect.top;
          const parentCenterX = pRect.left - paperRect.left + pRect.width / 2;
          const childTop = cRect.top - paperRect.top;
          const childCenterX = cRect.left - paperRect.left + cRect.width / 2;

          const midY = (parentBottom + childTop) / 2;

          const points = [
            [parentCenterX, parentBottom],
            [parentCenterX, midY],
            [childCenterX, midY],
            [childCenterX, childTop],
          ];

          return points;
        })
        .filter(Boolean);

      setEdges(newEdges);
    } catch (e) {
      setEdges([]);
    }
  };

  useEffect(() => {
    computeEdges();
    const onResize = () => computeEdges();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    const observer = new MutationObserver(() => computeEdges());
    if (paperRef && paperRef.current) {
      observer.observe(paperRef.current, { attributes: true, childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      observer.disconnect();
    };
  }, [node, paperRef]);

  if (!paperRef || !paperRef.current) return null;

  const paperRect = paperRef.current.getBoundingClientRect();

  return (
    <svg
      className="oc-edges"
      width={paperRect.width}
      height={paperRect.height}
      viewBox={`0 0 ${Math.round(paperRect.width)} ${Math.round(paperRect.height)}`}
      preserveAspectRatio="none"
    >
      {edges.map((pts, i) => (
        <polyline
          key={i}
          fill="none"
          stroke="#6c757d"
          strokeWidth="2"
          strokeLinejoin="miter"
          strokeLinecap="round"
          points={pts.map((p) => `${Math.round(p[0])},${Math.round(p[1])}`).join(" ")}
        />
      ))}
    </svg>
  );
};

export default ChartEdges;
