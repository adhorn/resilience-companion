import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { PracticeTable } from "../components/PracticeTable";

export function ORRList() {
  const [orrs, setOrrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.orrs
      .list()
      .then((res) =>
        setOrrs(
          res.orrs.map((orr: any) => ({
            ...orr,
            title: orr.serviceName,
            serviceName: orr.serviceName,
          })),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

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
      ) : (
        <PracticeTable
          items={orrs}
          basePath="/orrs"
          emptyText="No ORRs yet. Create your first one to get started."
          newPath="/orrs/new"
          newLabel="New ORR"
          showCoverage={false}
        />
      )}
    </div>
  );
}
