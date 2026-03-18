import { useState, useEffect } from "react";
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

const TYPE_ICONS: Record<string, string> = {
  database: "cylindrical",
  cache: "bolt",
  queue: "arrow-right",
  api: "globe",
  storage: "archive",
  cdn: "globe",
  dns: "globe",
  auth: "shield",
  internal_service: "cube",
  external_service: "cloud",
  infrastructure: "server",
  other: "puzzle",
};

const TYPE_COLORS: Record<string, string> = {
  database: "bg-purple-100 text-purple-700 border-purple-200",
  cache: "bg-red-100 text-red-700 border-red-200",
  queue: "bg-amber-100 text-amber-700 border-amber-200",
  api: "bg-blue-100 text-blue-700 border-blue-200",
  storage: "bg-indigo-100 text-indigo-700 border-indigo-200",
  cdn: "bg-cyan-100 text-cyan-700 border-cyan-200",
  dns: "bg-teal-100 text-teal-700 border-teal-200",
  auth: "bg-emerald-100 text-emerald-700 border-emerald-200",
  internal_service: "bg-sky-100 text-sky-700 border-sky-200",
  external_service: "bg-violet-100 text-violet-700 border-violet-200",
  infrastructure: "bg-gray-100 text-gray-700 border-gray-200",
  other: "bg-gray-100 text-gray-600 border-gray-200",
};

const CRITICALITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  important: "bg-orange-500 text-white",
  optional: "bg-gray-400 text-white",
};

const DIRECTION_LABELS: Record<string, string> = {
  outbound: "depends on",
  inbound: "depended on by",
  both: "bidirectional",
};

export function DependenciesPanel({ orrId, sections }: { orrId: string; sections: any[] }) {
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeps();
  }, [orrId]);

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
    } catch {
      // silently fail
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-500 text-sm">Loading dependencies...</div>;
  }

  // Group by type
  const grouped = deps.reduce<Record<string, Dependency[]>>((acc, dep) => {
    (acc[dep.type] = acc[dep.type] || []).push(dep);
    return acc;
  }, {});

  // Stats
  const criticalCount = deps.filter((d) => d.criticality === "critical").length;
  const noFallbackCritical = deps.filter((d) => d.criticality === "critical" && !d.hasFallback).length;
  const typeCount = Object.keys(grouped).length;

  const getSectionTitle = (sectionId: string | null) => {
    if (!sectionId) return null;
    const sec = sections.find((s) => s.id === sectionId);
    return sec?.title || null;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Summary bar */}
      {deps.length > 0 && (
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-gray-900">Dependency Map</h3>
            <button
              onClick={loadDeps}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Total</div>
              <div className="font-bold text-lg">{deps.length}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Types</div>
              <div className="font-bold text-lg">{typeCount}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Critical</div>
              <div className="font-bold text-lg">{criticalCount}</div>
            </div>
            <div className={`rounded p-2 ${noFallbackCritical > 0 ? "bg-red-50" : "bg-gray-50"}`}>
              <div className={noFallbackCritical > 0 ? "text-red-600" : "text-gray-500"}>No fallback (critical)</div>
              <div className={`font-bold text-lg ${noFallbackCritical > 0 ? "text-red-700" : ""}`}>{noFallbackCritical}</div>
            </div>
          </div>
        </div>
      )}

      {/* Dependency list grouped by type */}
      <div className="overflow-y-auto flex-1 p-4">
        {deps.length === 0 ? (
          <div className="text-center text-gray-400 text-sm mt-8">
            <p>No dependencies discovered yet.</p>
            <p className="mt-2 text-xs">
              The AI agent records dependencies as they come up during the review conversation.
              Start discussing your service's architecture to build the map.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped)
              .sort(([, a], [, b]) => b.length - a.length)
              .map(([type, typeDeps]) => (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[type] || TYPE_COLORS.other}`}>
                      {type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-gray-400">{typeDeps.length}</span>
                  </div>

                  <div className="space-y-2 ml-1">
                    {typeDeps
                      .sort((a, b) => {
                        const order = { critical: 0, important: 1, optional: 2 };
                        return (order[a.criticality as keyof typeof order] ?? 2) - (order[b.criticality as keyof typeof order] ?? 2);
                      })
                      .map((dep) => (
                        <div
                          key={dep.id}
                          className="border border-gray-200 rounded-lg px-3 py-2.5 bg-white hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{dep.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${CRITICALITY_COLORS[dep.criticality]}`}>
                              {dep.criticality}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {DIRECTION_LABELS[dep.direction]}
                            </span>
                            {dep.hasFallback ? (
                              <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                has fallback
                              </span>
                            ) : dep.criticality === "critical" ? (
                              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-medium">
                                no fallback
                              </span>
                            ) : null}
                            <button
                              onClick={() => handleDelete(dep.id)}
                              className="ml-auto text-gray-300 hover:text-red-500 text-xs"
                              title="Remove dependency"
                            >
                              &times;
                            </button>
                          </div>

                          {dep.fallbackDescription && (
                            <div className="mt-1 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                              Fallback: {dep.fallbackDescription}
                            </div>
                          )}

                          {dep.notes && (
                            <div className="mt-1 text-xs text-gray-500">{dep.notes}</div>
                          )}

                          {getSectionTitle(dep.sectionId) && (
                            <div className="mt-1 text-[10px] text-gray-400">
                              Discovered in: {getSectionTitle(dep.sectionId)}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
