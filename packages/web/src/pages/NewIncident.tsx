import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export function NewIncident() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [severity, setSeverity] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const data: Record<string, string> = { title };
      if (serviceName.trim()) data.serviceName = serviceName.trim();
      if (incidentDate) data.incidentDate = new Date(incidentDate).toISOString();
      if (severity) data.severity = severity;
      if (incidentType) data.incidentType = incidentType;
      const res = await api.incidents.create(data as any);
      navigate(`/incidents/${res.incident.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-xl font-bold text-gray-900 mb-6">New Incident Analysis</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">Incident Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g., DB Connection Exhaustion - March 2024"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Affected Service
            <span className="text-gray-400 font-normal ml-1">(optional)</span>
          </label>
          <input
            type="text"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            placeholder="e.g., Payment Service"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Incident Date
            <span className="text-gray-400 font-normal ml-1">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Severity
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">--</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Type
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </label>
            <select
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">--</option>
              <option value="OUTAGE">Outage</option>
              <option value="DEGRADATION">Degradation</option>
              <option value="NEAR_MISS">Near Miss</option>
              <option value="SURPRISING_BEHAVIOR">Surprising Behavior</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          The analysis will use a 14-section template covering timeline, contributing factors, system dynamics, and learning opportunities.
        </p>

        <button
          type="submit"
          disabled={creating}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Incident Analysis"}
        </button>
      </form>
    </div>
  );
}
