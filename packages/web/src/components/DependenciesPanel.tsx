import { useState, useEffect, useRef, useCallback } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import { api } from "../api/client";

interface Dependency {
  id: string;
  name: string;
  type: string;
  direction: string;
  criticality: string;
  hasFallback: number;
  fallbackDescription: string | null;
  notes: string | null;
  sectionId: string | null;
  createdAt: string;
}

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  criticality: string;
  hasFallback: boolean;
  isCenter: boolean;
  radius: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  direction: string;
  criticality: string;
}

const NODE_COLORS: Record<string, { fill: string; stroke: string }> = {
  center:             { fill: "#3b82f6", stroke: "#1d4ed8" },
  database:           { fill: "#a855f7", stroke: "#7c3aed" },
  cache:              { fill: "#ef4444", stroke: "#dc2626" },
  queue:              { fill: "#f59e0b", stroke: "#d97706" },
  api:                { fill: "#3b82f6", stroke: "#2563eb" },
  storage:            { fill: "#6366f1", stroke: "#4f46e5" },
  cdn:                { fill: "#06b6d4", stroke: "#0891b2" },
  dns:                { fill: "#14b8a6", stroke: "#0d9488" },
  auth:               { fill: "#10b981", stroke: "#059669" },
  internal_service:   { fill: "#0ea5e9", stroke: "#0284c7" },
  external_service:   { fill: "#8b5cf6", stroke: "#7c3aed" },
  infrastructure:     { fill: "#6b7280", stroke: "#4b5563" },
  other:              { fill: "#9ca3af", stroke: "#6b7280" },
};

const CRITICALITY_STROKE: Record<string, string> = {
  critical: "#ef4444",
  important: "#f59e0b",
  optional: "#d1d5db",
};

interface Props {
  orrId: string;
  serviceName: string;
  sections: any[];
}

export function DependenciesPanel({ orrId, serviceName, sections }: Props) {
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number } | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);

  useEffect(() => {
    loadDeps();
  }, [orrId]);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  async function loadDeps() {
    setLoading(true);
    try {
      const res = await api.dependencies.list(orrId);
      setDeps(res.dependencies);
    } catch {
      // silently fail
    }
    setLoading(false);
  }

  async function handleDelete(depId: string) {
    try {
      await api.dependencies.delete(orrId, depId);
      setDeps((prev) => prev.filter((d) => d.id !== depId));
      if (selectedNode === depId) setSelectedNode(null);
    } catch {
      // silently fail
    }
  }

  // Build graph when deps or dimensions change
  useEffect(() => {
    if (deps.length === 0) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const centerNode: GraphNode = {
      id: "center",
      label: serviceName || "Your Service",
      type: "center",
      criticality: "",
      hasFallback: false,
      isCenter: true,
      radius: 32,
      x: dimensions.width / 2,
      y: dimensions.height / 2,
    };

    const depNodes: GraphNode[] = deps.map((d) => ({
      id: d.id,
      label: d.name,
      type: d.type,
      criticality: d.criticality,
      hasFallback: !!d.hasFallback,
      isCenter: false,
      radius: d.criticality === "critical" ? 24 : d.criticality === "important" ? 20 : 16,
    }));

    const graphLinks: GraphLink[] = deps.map((d) => ({
      source: d.direction === "inbound" ? d.id : "center",
      target: d.direction === "inbound" ? "center" : d.id,
      direction: d.direction,
      criticality: d.criticality,
    }));

    const allNodes = [centerNode, ...depNodes];

    const sim = forceSimulation<GraphNode>(allNodes)
      .force("link", forceLink<GraphNode, GraphLink>(graphLinks).id((d) => d.id).distance(140))
      .force("charge", forceManyBody().strength(-300))
      .force("center", forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force("collide", forceCollide<GraphNode>().radius((d) => d.radius + 20))
      .alphaDecay(0.02);

    // Pin center node
    centerNode.fx = dimensions.width / 2;
    centerNode.fy = dimensions.height / 2;

    simRef.current = sim;

    sim.on("tick", () => {
      setNodes([...allNodes]);
      setLinks([...graphLinks]);
    });

    return () => {
      sim.stop();
    };
  }, [deps, dimensions, serviceName]);

  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (nodeId === "center") return;
    e.preventDefault();
    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY };

    const node = simRef.current?.nodes().find((n) => n.id === nodeId);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
      simRef.current?.alphaTarget(0.3).restart();
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || !svgRef.current) return;
    const node = simRef.current?.nodes().find((n) => n.id === dragRef.current!.nodeId);
    if (!node) return;

    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()!.inverse());

    node.fx = svgP.x;
    node.fy = svgP.y;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!dragRef.current) return;
    const node = simRef.current?.nodes().find((n) => n.id === dragRef.current!.nodeId);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    simRef.current?.alphaTarget(0);
    dragRef.current = null;
  }, []);

  const getSectionTitle = (sectionId: string | null) => {
    if (!sectionId) return null;
    const sec = sections.find((s: any) => s.id === sectionId);
    return sec?.title || null;
  };

  const selectedDep = selectedNode ? deps.find((d) => d.id === selectedNode) : null;

  if (loading) {
    return <div className="p-6 text-gray-500 text-sm">Loading dependencies...</div>;
  }

  if (deps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-400 text-sm">
          <div className="mb-3">
            <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" strokeWidth={2} />
              <path strokeLinecap="round" strokeWidth={2} d="M12 2v4m0 12v4m-7.07-2.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-2.93 7.07l-2.83-2.83M6.76 6.76L3.93 3.93" />
            </svg>
          </div>
          <p>No dependencies discovered yet.</p>
          <p className="mt-2 text-xs max-w-xs mx-auto">
            The AI agent records dependencies during the review conversation.
            You can also type <span className="font-mono text-blue-500">/dependencies</span> to scan what's been discussed.
          </p>
        </div>
      </div>
    );
  }

  // Stats
  const criticalCount = deps.filter((d) => d.criticality === "critical").length;
  const noFallbackCritical = deps.filter((d) => d.criticality === "critical" && !d.hasFallback).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Stats bar */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-4 text-xs">
        <span className="text-gray-500">{deps.length} dependencies</span>
        <span className="text-gray-300">|</span>
        {criticalCount > 0 && (
          <span className="text-red-600 font-medium">{criticalCount} critical</span>
        )}
        {noFallbackCritical > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-red-600 font-bold">{noFallbackCritical} critical without fallback</span>
          </>
        )}
        <button onClick={loadDeps} className="ml-auto text-gray-400 hover:text-gray-600">Refresh</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Graph area */}
        <div ref={containerRef} className="flex-1 min-w-0 bg-gray-50 relative overflow-hidden">
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="cursor-grab active:cursor-grabbing select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Defs for arrowheads */}
            <defs>
              {["critical", "important", "optional"].map((crit) => (
                <marker
                  key={crit}
                  id={`arrow-${crit}`}
                  viewBox="0 0 10 6"
                  refX="10"
                  refY="3"
                  markerWidth="8"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,3 L0,6 Z" fill={CRITICALITY_STROKE[crit] || "#d1d5db"} />
                </marker>
              ))}
            </defs>

            {/* Links */}
            {links.map((link, i) => {
              const source = link.source as GraphNode;
              const target = link.target as GraphNode;
              if (source.x == null || source.y == null || target.x == null || target.y == null) return null;

              const dx = target.x - source.x;
              const dy = target.y - source.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const sourceR = (source as GraphNode).radius;
              const targetR = (target as GraphNode).radius;

              const x1 = source.x + (dx / dist) * sourceR;
              const y1 = source.y + (dy / dist) * sourceR;
              const x2 = target.x - (dx / dist) * (targetR + 8);
              const y2 = target.y - (dy / dist) * (targetR + 8);

              const isCritical = link.criticality === "critical";
              const isHighlighted = hoveredNode === (source as GraphNode).id || hoveredNode === (target as GraphNode).id;

              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={CRITICALITY_STROKE[link.criticality] || "#d1d5db"}
                  strokeWidth={isCritical ? 2.5 : 1.5}
                  strokeDasharray={link.direction === "both" ? "none" : "none"}
                  opacity={hoveredNode && !isHighlighted ? 0.15 : 0.7}
                  markerEnd={`url(#arrow-${link.criticality})`}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const colors = NODE_COLORS[node.type] || NODE_COLORS.other;
              const isSelected = selectedNode === node.id;
              const isHovered = hoveredNode === node.id;
              const dimmed = hoveredNode && !isHovered && hoveredNode !== "center" && node.id !== "center"
                && !links.some((l) => {
                  const s = (l.source as GraphNode).id;
                  const t = (l.target as GraphNode).id;
                  return (s === hoveredNode && t === node.id) || (t === hoveredNode && s === node.id);
                });

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x || 0},${node.y || 0})`}
                  opacity={dimmed ? 0.2 : 1}
                  style={{ transition: "opacity 0.15s" }}
                  onMouseDown={(e) => handleMouseDown(e, node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => !node.isCenter && setSelectedNode(node.id === selectedNode ? null : node.id)}
                  className="cursor-pointer"
                >
                  {/* Glow for critical without fallback */}
                  {node.criticality === "critical" && !node.hasFallback && (
                    <circle r={node.radius + 6} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 3" opacity={0.6} />
                  )}

                  {/* Selection ring */}
                  {isSelected && (
                    <circle r={node.radius + 4} fill="none" stroke="#3b82f6" strokeWidth={2.5} />
                  )}

                  {/* Node circle */}
                  <circle
                    r={node.radius}
                    fill={node.isCenter ? "#1e293b" : colors.fill}
                    stroke={node.isCenter ? "#0f172a" : colors.stroke}
                    strokeWidth={node.isCenter ? 3 : 2}
                    opacity={0.9}
                  />

                  {/* Label */}
                  <text
                    y={node.radius + 14}
                    textAnchor="middle"
                    fill={dimmed ? "#d1d5db" : "#374151"}
                    fontSize={node.isCenter ? 12 : 11}
                    fontWeight={node.isCenter ? 700 : 500}
                    className="select-none pointer-events-none"
                  >
                    {node.label}
                  </text>

                  {/* Type label inside circle for center */}
                  {node.isCenter && (
                    <text
                      textAnchor="middle"
                      dy="0.35em"
                      fill="white"
                      fontSize={10}
                      fontWeight={600}
                      className="select-none pointer-events-none"
                    >
                      {node.label.length > 12 ? node.label.slice(0, 11) + "..." : node.label}
                    </text>
                  )}

                  {/* Type icon text for dep nodes */}
                  {!node.isCenter && (
                    <text
                      textAnchor="middle"
                      dy="0.35em"
                      fill="white"
                      fontSize={9}
                      fontWeight={600}
                      className="select-none pointer-events-none"
                    >
                      {node.type.replace(/_/g, " ").slice(0, 4).toUpperCase()}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-lg border border-gray-200 px-3 py-2 text-[10px] text-gray-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> critical
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> important
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400" /> optional
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full border-2 border-dashed border-red-400" /> no fallback
              </span>
            </div>
          </div>
        </div>

        {/* Detail panel (slides in when a node is selected) */}
        {selectedDep && (
          <div className="w-72 border-l border-gray-200 bg-white overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm text-gray-900">{selectedDep.name}</h4>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-gray-500">Type</span>
                <div className="mt-0.5 font-medium text-gray-700">{selectedDep.type.replace(/_/g, " ")}</div>
              </div>
              <div>
                <span className="text-gray-500">Direction</span>
                <div className="mt-0.5 font-medium text-gray-700">
                  {selectedDep.direction === "outbound" ? "Your service depends on this" :
                   selectedDep.direction === "inbound" ? "This depends on your service" : "Bidirectional"}
                </div>
              </div>
              <div>
                <span className="text-gray-500">Criticality</span>
                <div className="mt-0.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    selectedDep.criticality === "critical" ? "bg-red-600 text-white" :
                    selectedDep.criticality === "important" ? "bg-orange-500 text-white" :
                    "bg-gray-400 text-white"
                  }`}>
                    {selectedDep.criticality}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-gray-500">Fallback</span>
                <div className="mt-0.5">
                  {selectedDep.hasFallback ? (
                    <span className="text-green-600 font-medium">Has fallback</span>
                  ) : (
                    <span className={selectedDep.criticality === "critical" ? "text-red-600 font-bold" : "text-gray-500"}>
                      No fallback
                    </span>
                  )}
                </div>
                {selectedDep.fallbackDescription && (
                  <div className="mt-1 text-gray-600 bg-green-50 rounded px-2 py-1">
                    {selectedDep.fallbackDescription}
                  </div>
                )}
              </div>
              {selectedDep.notes && (
                <div>
                  <span className="text-gray-500">Notes</span>
                  <div className="mt-0.5 text-gray-700">{selectedDep.notes}</div>
                </div>
              )}
              {getSectionTitle(selectedDep.sectionId) && (
                <div>
                  <span className="text-gray-500">Discovered in</span>
                  <div className="mt-0.5 text-gray-700">{getSectionTitle(selectedDep.sectionId)}</div>
                </div>
              )}
              <button
                onClick={() => handleDelete(selectedDep.id)}
                className="mt-2 w-full py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
              >
                Remove dependency
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
