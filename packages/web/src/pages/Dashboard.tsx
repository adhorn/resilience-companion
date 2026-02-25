import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard
      .get()
      .then((res) => setStats(res.dashboard))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!stats) return <div className="p-6 text-red-500">Failed to load dashboard</div>;

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    COMPLETE: "bg-green-100 text-green-700",
    ARCHIVED: "bg-yellow-100 text-yellow-700",
  };

  const stalenessColors: Record<string, string> = {
    fresh: "text-green-600",
    aging: "text-yellow-600",
    stale: "text-red-600",
  };

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-2xl font-bold">{stats.totalOrrs}</div>
          <div className="text-sm text-gray-500">Total ORRs</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-2xl font-bold">{stats.byStatus.IN_PROGRESS}</div>
          <div className="text-sm text-gray-500">In Progress</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-2xl font-bold text-yellow-600">{stats.aging}</div>
          <div className="text-sm text-gray-500">Aging</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-2xl font-bold text-red-600">{stats.stale}</div>
          <div className="text-sm text-gray-500">Stale</div>
        </div>
      </div>

      {/* Surrogation warning */}
      <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-6 text-sm text-amber-800">
        These metrics describe activity patterns, not learning quality. An ORR marked "complete" isn't necessarily a good ORR — what matters is whether the team learned something.
      </div>

      {/* ORR table */}
      {stats.recentActivity.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <p className="text-gray-500 mb-4">No ORRs yet</p>
          <Link
            to="/orrs/new"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
          >
            Start your first ORR
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Service</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Coverage</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Last Updated</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Freshness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stats.recentActivity.map((orr: any) => (
                <tr key={orr.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/orrs/${orr.id}`} className="text-blue-600 hover:underline font-medium">
                      {orr.serviceName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColors[orr.status]}`}>
                      {orr.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${orr.coveragePercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{orr.coveragePercent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(orr.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${stalenessColors[orr.staleness]}`}>
                      {orr.staleness}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
