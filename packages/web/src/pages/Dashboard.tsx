import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { SEVERITY_COLORS_LIGHT } from "../lib/style-constants";
import { PracticeTable } from "../components/PracticeTable";

function StatusBreakdown({ counts }: { counts: Record<string, number> }) {
  const active = Object.entries(counts).filter(([, v]) => v > 0);
  if (active.length === 0) return null;
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {active.map(([status, count]) => (
        <span key={status} className="text-xs text-gray-500">
          {count} {status.replace(/_/g, " ").toLowerCase()}
        </span>
      ))}
    </div>
  );
}

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

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h2>

      {/* Practice summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Link to="/orrs" className="bg-white p-4 rounded-lg shadow-sm border hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold">{stats.totalOrrs}</div>
            <span className="text-xs text-blue-600">View all &rarr;</span>
          </div>
          <div className="text-sm font-medium text-gray-700">Operational Readiness Reviews</div>
          <StatusBreakdown counts={stats.orrsByStatus} />
        </Link>

        <Link to="/incidents" className="bg-white p-4 rounded-lg shadow-sm border hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold">{stats.totalIncidents}</div>
            <span className="text-xs text-blue-600">View all &rarr;</span>
          </div>
          <div className="text-sm font-medium text-gray-700">Incident Analyses</div>
          <StatusBreakdown counts={stats.incidentsByStatus} />
        </Link>
      </div>

      {/* Learning signals */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white p-3 rounded-lg shadow-sm border">
          <div className="text-lg font-bold">{stats.openActionItems}</div>
          <div className="text-xs text-gray-500">Open Actions</div>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border">
          <div className="text-lg font-bold">{stats.experimentSuggestions}</div>
          <div className="text-xs text-gray-500">Experiment Suggestions</div>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border">
          <div className="text-lg font-bold">{stats.crossPracticeLinks}</div>
          <div className="text-xs text-gray-500">Cross-Practice Links</div>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border">
          <div className="text-lg font-bold">{stats.recentDiscoveries}</div>
          <div className="text-xs text-gray-500">Discoveries (30d)</div>
        </div>
      </div>

      {/* Surrogation warning */}
      <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-6 text-sm text-amber-800">
        These counts describe activity, not learning quality. What matters is whether practices produced surprises, changed mental models, and informed each other.
      </div>

      {/* Recent ORRs */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Recent ORRs</h3>
          <Link to="/orrs" className="text-xs text-blue-600 hover:underline">View all &rarr;</Link>
        </div>
        <PracticeTable
          items={stats.recentOrrs}
          basePath="/orrs"
          emptyText="No ORRs yet"
          newPath="/orrs/new"
          newLabel="Start your first ORR"
        />
      </div>

      {/* Recent Incidents */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Recent Incidents</h3>
          <Link to="/incidents" className="text-xs text-blue-600 hover:underline">View all &rarr;</Link>
        </div>
        <PracticeTable
          items={stats.recentIncidents}
          basePath="/incidents"
          emptyText="No incident analyses yet"
          newPath="/incidents/new"
          newLabel="Create your first incident analysis"
          extraColumns={[{
            header: "Severity",
            render: (item) => item.severity ? (
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS_LIGHT[item.severity] || ""}`}>
                {item.severity}
              </span>
            ) : <span className="text-xs text-gray-400">--</span>,
          }]}
        />
      </div>
    </div>
  );
}
