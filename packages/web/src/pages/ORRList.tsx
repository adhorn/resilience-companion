import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

export function ORRList() {
  const [orrs, setOrrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.orrs
      .list()
      .then((res) => setOrrs(res.orrs))
      .finally(() => setLoading(false));
  }, []);

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    COMPLETE: "bg-green-100 text-green-700",
    ARCHIVED: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">ORRs</h2>
        <Link
          to="/orrs/new"
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          New ORR
        </Link>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : orrs.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
          No ORRs yet. Create your first one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {orrs.map((orr) => (
            <Link
              key={orr.id}
              to={`/orrs/${orr.id}`}
              className="block bg-white rounded-lg shadow-sm border p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{orr.serviceName}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Updated {new Date(orr.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[orr.status]}`}>
                  {orr.status.replace("_", " ")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
