import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { SEVERITY_COLORS_LIGHT } from "../lib/style-constants";
import { PracticeTable } from "../components/PracticeTable";

export function IncidentList() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.incidents
      .list()
      .then((res) =>
        setIncidents(
          res.incidents.map((inc: any) => ({
            ...inc,
            title: inc.title,
            serviceName: inc.serviceName ?? "Unknown service",
          })),
        ),
      )
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
      ) : (
        <PracticeTable
          items={incidents}
          basePath="/incidents"
          emptyText="No incident analyses yet. Create your first one to get started."
          newPath="/incidents/new"
          newLabel="New Incident"
          showCoverage={false}
          extraColumns={[{
            header: "Severity",
            render: (item) => item.severity ? (
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS_LIGHT[item.severity] || ""}`}>
                {item.severity}
              </span>
            ) : <span className="text-xs text-gray-400">--</span>,
          }]}
        />
      )}
    </div>
  );
}
