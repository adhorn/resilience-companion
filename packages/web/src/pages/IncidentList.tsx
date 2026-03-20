import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-purple-100 text-purple-700",
  PUBLISHED: "bg-green-100 text-green-700",
  ARCHIVED: "bg-yellow-100 text-yellow-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-orange-100 text-orange-700",
  LOW: "bg-yellow-100 text-yellow-700",
};

export function IncidentList() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.incidents
      .list()
      .then((res) => setIncidents(res.incidents))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Incident Analyses</h2>
        <Link
          to="/incidents/new"
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          New Incident
        </Link>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : incidents.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
          No incident analyses yet. Create your first one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc) => (
            <Link
              key={inc.id}
              to={`/incidents/${inc.id}`}
              className="block bg-white rounded-lg shadow-sm border p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{inc.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {inc.serviceName && (
                      <span className="text-xs text-gray-500">{inc.serviceName}</span>
                    )}
                    {inc.severity && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SEVERITY_COLORS[inc.severity] || ""}`}>
                        {inc.severity}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      Updated {new Date(inc.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[inc.status] || ""}`}>
                  {inc.status.replace(/_/g, " ")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
