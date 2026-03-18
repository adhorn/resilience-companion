import { useState, useEffect } from "react";
import { api } from "../api/client";

interface TraceStats {
  totalTraces: number;
  errorCount: number;
  errorRate: number;
  fallbackCount: number;
  fallbackRate: number;
  avgTokens: number;
  avgDurationMs: number;
  totalTokens: number;
  toolStats: Array<{ toolName: string; count: number; avgDurationMs: number }>;
}

interface Trace {
  id: string;
  model: string;
  fallbackModel: string | null;
  totalTokens: number;
  iterationCount: number;
  toolCallsCount: number;
  retryCount: number;
  fallbackUsed: number;
  error: string | null;
  durationMs: number;
  createdAt: string;
}

interface Span {
  id: string;
  type: "llm_call" | "tool_call" | "retry" | "fallback";
  iteration: number;
  model: string | null;
  toolName: string | null;
  toolArgs: string | null;
  toolResultSummary: string | null;
  sectionId: string | null;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  retryAttempt: number | null;
  retryReason: string | null;
  retryDelayMs: number | null;
  error: string | null;
  createdAt: string;
}

const SPAN_COLORS: Record<string, string> = {
  llm_call: "bg-blue-100 border-blue-300 text-blue-800",
  tool_call: "bg-green-100 border-green-300 text-green-800",
  retry: "bg-yellow-100 border-yellow-300 text-yellow-800",
  fallback: "bg-orange-100 border-orange-300 text-orange-800",
};

export function TracesPanel({ orrId }: { orrId: string }) {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<(Trace & { spans: Span[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "errors" | "fallback">("all");

  useEffect(() => {
    loadData();
  }, [orrId, filter]);

  async function loadData() {
    setLoading(true);
    try {
      const params: Record<string, boolean> = {};
      if (filter === "errors") params.hasError = true;
      if (filter === "fallback") params.fallbackUsed = true;

      const [traceList, statsData] = await Promise.all([
        api.traces.list(orrId, params),
        api.traces.stats(orrId),
      ]);
      setTraces(traceList);
      setStats(statsData);
    } catch {
      // silently fail
    }
    setLoading(false);
  }

  async function loadTrace(traceId: string) {
    try {
      const data = await api.traces.get(orrId, traceId);
      setSelectedTrace(data);
    } catch {
      // silently fail
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-500 text-sm">Loading traces...</div>;
  }

  if (selectedTrace) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-white">
          <button
            onClick={() => setSelectedTrace(null)}
            className="text-xs text-blue-600 hover:underline mb-2"
          >
            &larr; Back to traces
          </button>
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900 text-sm">Trace Detail</h3>
            <span className="text-xs text-gray-500">{selectedTrace.model}</span>
            {selectedTrace.error && (
              <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Error</span>
            )}
            {selectedTrace.fallbackUsed === 1 && (
              <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Fallback</span>
            )}
          </div>
          <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
            <span>{selectedTrace.totalTokens} tokens</span>
            <span>{selectedTrace.durationMs}ms</span>
            <span>{selectedTrace.iterationCount} iterations</span>
            <span>{selectedTrace.toolCallsCount} tool calls</span>
            <span>{new Date(selectedTrace.createdAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {selectedTrace.spans.map((span) => (
            <div
              key={span.id}
              className={`border rounded px-3 py-2 text-xs ${SPAN_COLORS[span.type] || "bg-gray-50 border-gray-200"}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">{span.type}</span>
                <span className="text-[10px] opacity-70">iter {span.iteration}</span>
                <span className="ml-auto text-[10px] opacity-70">{span.durationMs}ms</span>
              </div>

              {span.type === "llm_call" && (
                <div className="mt-1 text-[10px] opacity-80">
                  Model: {span.model} | {span.promptTokens + span.completionTokens} tokens
                  ({span.promptTokens}p / {span.completionTokens}c)
                </div>
              )}

              {span.type === "tool_call" && (
                <div className="mt-1 space-y-0.5">
                  <div className="text-[10px] font-medium">{span.toolName}</div>
                  {span.toolArgs && (
                    <div className="text-[10px] opacity-70 font-mono truncate" title={span.toolArgs}>
                      Args: {span.toolArgs.slice(0, 120)}
                    </div>
                  )}
                  {span.toolResultSummary && (
                    <div className="text-[10px] opacity-70 font-mono truncate" title={span.toolResultSummary}>
                      Result: {span.toolResultSummary.slice(0, 120)}
                    </div>
                  )}
                  {span.sectionId && (
                    <div className="text-[10px] opacity-70">Section: {span.sectionId}</div>
                  )}
                </div>
              )}

              {span.type === "retry" && (
                <div className="mt-1 text-[10px]">
                  Attempt {span.retryAttempt}: {span.retryReason} (delay: {span.retryDelayMs}ms)
                </div>
              )}

              {span.type === "fallback" && (
                <div className="mt-1 text-[10px]">
                  Switched to: {span.model}
                </div>
              )}

              {span.error && (
                <div className="mt-1 text-[10px] text-red-700 bg-red-50 px-1 rounded">
                  {span.error}
                </div>
              )}
            </div>
          ))}

          {selectedTrace.spans.length === 0 && (
            <div className="text-gray-400 text-sm">No spans recorded</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Stats summary */}
      {stats && stats.totalTraces > 0 && (
        <div className="p-4 border-b border-gray-200 bg-white">
          <h3 className="font-semibold text-sm text-gray-900 mb-2">Agent Trace Stats</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Total turns</div>
              <div className="font-bold text-lg">{stats.totalTraces}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Error rate</div>
              <div className="font-bold text-lg">{(stats.errorRate * 100).toFixed(1)}%</div>
              <div className="text-[10px] text-gray-400">{stats.errorCount} errors</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Fallback rate</div>
              <div className="font-bold text-lg">{(stats.fallbackRate * 100).toFixed(1)}%</div>
              <div className="text-[10px] text-gray-400">{stats.fallbackCount} fallbacks</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Avg tokens/turn</div>
              <div className="font-bold text-lg">{stats.avgTokens.toLocaleString()}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Avg duration</div>
              <div className="font-bold text-lg">{(stats.avgDurationMs / 1000).toFixed(1)}s</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Total tokens</div>
              <div className="font-bold text-lg">{stats.totalTokens.toLocaleString()}</div>
            </div>
          </div>

          {stats.toolStats.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] text-gray-500 mb-1">Tool usage</div>
              <div className="flex flex-wrap gap-1">
                {stats.toolStats.map((t) => (
                  <span key={t.toolName} className="text-[10px] bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                    {t.toolName} ({t.count}x, {Math.round(t.avgDurationMs)}ms avg)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="px-4 py-2 border-b border-gray-100 flex gap-2">
        {(["all", "errors", "fallback"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2 py-1 rounded ${
              filter === f ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {f === "all" ? "All" : f === "errors" ? "Errors" : "Fallback"}
          </button>
        ))}
        <button
          onClick={loadData}
          className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
        >
          Refresh
        </button>
      </div>

      {/* Trace list */}
      <div className="overflow-y-auto flex-1">
        {traces.length === 0 ? (
          <div className="p-6 text-gray-400 text-sm text-center">
            No traces yet. Send a message to the AI agent to generate traces.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-gray-500">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Iter</th>
                <th className="px-3 py-2">Tools</th>
                <th className="px-3 py-2">Tokens</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => loadTrace(t.id)}
                  className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer"
                >
                  <td className="px-3 py-2 text-gray-500">
                    {new Date(t.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {t.model.replace("claude-", "").slice(0, 15)}
                  </td>
                  <td className="px-3 py-2">{t.iterationCount}</td>
                  <td className="px-3 py-2">{t.toolCallsCount}</td>
                  <td className="px-3 py-2">{t.totalTokens.toLocaleString()}</td>
                  <td className="px-3 py-2">{(t.durationMs / 1000).toFixed(1)}s</td>
                  <td className="px-3 py-2">
                    {t.error ? (
                      <span className="text-red-600">error</span>
                    ) : t.fallbackUsed === 1 ? (
                      <span className="text-orange-600">fallback</span>
                    ) : t.retryCount > 0 ? (
                      <span className="text-yellow-600">retried</span>
                    ) : (
                      <span className="text-green-600">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
