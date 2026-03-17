import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

const FLAG_COLORS: Record<string, string> = {
  RISK: "bg-red-100 text-red-700",
  GAP: "bg-amber-100 text-amber-700",
  STRENGTH: "bg-green-100 text-green-700",
  FOLLOW_UP: "bg-blue-100 text-blue-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-600 text-white",
  MEDIUM: "bg-orange-500 text-white",
  LOW: "bg-yellow-400 text-gray-900",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-gray-100 text-gray-600",
  ACCEPTED: "bg-purple-100 text-purple-700",
  RESOLVED: "bg-green-100 text-green-700",
};

const SEVERITIES = ["HIGH", "MEDIUM", "LOW"];
const STATUSES = ["OPEN", "ACCEPTED", "RESOLVED"];

interface ResolveDialog {
  flag: any;
  action: "ACCEPTED" | "RESOLVED";
}

export function Flags() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<any>(null);
  const [allFlags, setAllFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<ResolveDialog | null>(null);
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Read filters from URL
  const typeFilter = searchParams.get("type") || "";
  const severityFilter = searchParams.get("severity") || "";
  const orrFilter = searchParams.get("orrId") || "";
  const overdueOnly = searchParams.get("overdue") === "true";
  const statusFilter = searchParams.get("status") || "";

  const loadFlags = useCallback(() => {
    api.flags
      .list()
      .then((res) => {
        setSummary(res.summary);
        setAllFlags(res.flags);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = allFlags;
    if (typeFilter) result = result.filter((f) => f.type === typeFilter);
    if (severityFilter) result = result.filter((f) => f.severity === severityFilter);
    if (orrFilter) result = result.filter((f) => f.orrId === orrFilter);
    if (overdueOnly) result = result.filter((f) => f.isOverdue);
    if (statusFilter) result = result.filter((f) => (f.status || "OPEN") === statusFilter);
    return result;
  }, [allFlags, typeFilter, severityFilter, orrFilter, overdueOnly, statusFilter]);

  const services = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of allFlags) {
      map.set(f.orrId, f.serviceName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allFlags]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const handleAction = async () => {
    if (!dialog) return;
    setSubmitting(true);
    try {
      await api.flags.updateStatus(
        dialog.flag.orrId,
        dialog.flag.sectionId,
        dialog.flag.flagIndex,
        { status: dialog.action, resolution },
      );
      // Reload flags
      loadFlags();
      setDialog(null);
      setResolution("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async (flag: any) => {
    await api.flags.updateStatus(flag.orrId, flag.sectionId, flag.flagIndex, { status: "OPEN" });
    loadFlags();
  };

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  const hasFilters = typeFilter || severityFilter || orrFilter || overdueOnly || statusFilter;

  return (
    <div className="p-6 max-w-6xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Flags</h2>

      {/* Summary bar */}
      {summary && summary.total > 0 && (
        <div className="flex gap-3 flex-wrap mb-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
            {summary.total} Total
          </span>
          {summary.byType.RISK > 0 && (
            <button
              onClick={() => updateFilter("type", typeFilter === "RISK" ? "" : "RISK")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                typeFilter === "RISK" ? "ring-2 ring-red-400 " : ""
              }bg-red-100 text-red-700`}
            >
              {summary.byType.RISK} Risk{summary.byType.RISK !== 1 ? "s" : ""}
              {summary.bySeverity.HIGH > 0 && (
                <span className="bg-red-600 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {summary.bySeverity.HIGH} HIGH
                </span>
              )}
            </button>
          )}
          {summary.overdueCount > 0 && (
            <button
              onClick={() => updateFilter("overdue", overdueOnly ? "" : "true")}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                overdueOnly ? "ring-2 ring-red-400 " : ""
              }bg-red-600 text-white`}
            >
              {summary.overdueCount} Overdue
            </button>
          )}
          {summary.byType.GAP > 0 && (
            <button
              onClick={() => updateFilter("type", typeFilter === "GAP" ? "" : "GAP")}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                typeFilter === "GAP" ? "ring-2 ring-amber-400 " : ""
              }bg-amber-100 text-amber-700`}
            >
              {summary.byType.GAP} Gap{summary.byType.GAP !== 1 ? "s" : ""}
            </button>
          )}
          {summary.byType.FOLLOW_UP > 0 && (
            <button
              onClick={() => updateFilter("type", typeFilter === "FOLLOW_UP" ? "" : "FOLLOW_UP")}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                typeFilter === "FOLLOW_UP" ? "ring-2 ring-blue-400 " : ""
              }bg-blue-100 text-blue-700`}
            >
              {summary.byType.FOLLOW_UP} Follow-up{summary.byType.FOLLOW_UP !== 1 ? "s" : ""}
            </button>
          )}
          {summary.byType.STRENGTH > 0 && (
            <button
              onClick={() => updateFilter("type", typeFilter === "STRENGTH" ? "" : "STRENGTH")}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                typeFilter === "STRENGTH" ? "ring-2 ring-green-400 " : ""
              }bg-green-100 text-green-700`}
            >
              {summary.byType.STRENGTH} Strength{summary.byType.STRENGTH !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <select
          value={severityFilter}
          onChange={(e) => updateFilter("severity", e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={orrFilter}
          onChange={(e) => updateFilter("orrId", e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
        >
          <option value="">All services</option>
          {services.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => setSearchParams({}, { replace: true })}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}

        {hasFilters && (
          <span className="text-xs text-gray-500 ml-auto">
            Showing {filtered.length} of {summary?.total || 0} flags
          </span>
        )}
      </div>

      {/* Flags table */}
      {allFlags.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <p className="text-gray-500">No flags yet. Flags are created during AI review sessions.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <p className="text-gray-500">No flags match the current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-24">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-20">Severity</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-24">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Note</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-32">Service</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-32">Section</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-28">Deadline</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((flag: any, i: number) => {
                const status = flag.status || "OPEN";
                const isResolved = status === "RESOLVED" || status === "ACCEPTED";
                return (
                  <tr key={i} className={`hover:bg-gray-50 ${flag.isOverdue && !isResolved ? "bg-red-50/50" : ""} ${isResolved ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${FLAG_COLORS[flag.type]}`}>
                        {flag.type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {flag.severity && (
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${SEVERITY_COLORS[flag.severity]}`}>
                          {flag.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-md">
                      <div className="line-clamp-2">{flag.note}</div>
                      {flag.resolution && (
                        <div className="mt-1 text-xs text-gray-500 italic line-clamp-1">
                          {status === "ACCEPTED" ? "Accepted" : "Resolved"}: {flag.resolution}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/orrs/${flag.orrId}`} className="text-sm text-blue-600 hover:underline">
                        {flag.serviceName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {flag.sectionTitle}
                    </td>
                    <td className="px-4 py-3">
                      {flag.deadline && (
                        <span className={`text-xs ${flag.isOverdue && !isResolved ? "text-red-600 font-bold" : "text-gray-500"}`}>
                          {flag.isOverdue && !isResolved ? "OVERDUE: " : ""}{flag.deadline}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {status === "OPEN" ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setDialog({ flag, action: "ACCEPTED" }); setResolution(""); }}
                            className="text-[10px] px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => { setDialog({ flag, action: "RESOLVED" }); setResolution(""); }}
                            className="text-[10px] px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 font-medium"
                          >
                            Resolve
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleReopen(flag)}
                          className="text-[10px] px-2 py-1 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium"
                        >
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Resolution dialog */}
      {dialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-900 mb-1">
              {dialog.action === "ACCEPTED" ? "Accept Risk" : "Resolve Flag"}
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              {dialog.action === "ACCEPTED"
                ? "Acknowledge this risk and explain why it's acceptable."
                : "Describe what was done to address this flag."}
            </p>
            <div className="mb-3 p-2 bg-gray-50 rounded text-xs text-gray-600 line-clamp-3">
              {dialog.flag.note}
            </div>
            <textarea
              autoFocus
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder={dialog.action === "ACCEPTED" ? "Why is this risk acceptable?" : "What was done to resolve this?"}
              className="w-full border border-gray-300 rounded p-2.5 text-sm resize-y focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setDialog(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={!resolution.trim() || submitting}
                className={`px-4 py-1.5 text-sm font-medium rounded text-white disabled:opacity-50 ${
                  dialog.action === "ACCEPTED" ? "bg-purple-600 hover:bg-purple-700" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {submitting ? "..." : dialog.action === "ACCEPTED" ? "Accept Risk" : "Mark Resolved"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
