import React from "react";
import { Link } from "react-router-dom";
import { PRACTICE_STATUS_COLORS } from "../lib/style-constants";

export interface ExtraColumn {
  header: string;
  render: (item: any) => React.ReactNode;
}

/** Shared table for practice summaries (ORRs, incidents, etc.). */
export function PracticeTable({
  items,
  basePath,
  emptyText,
  newPath,
  newLabel,
  extraColumns,
  showCoverage = true,
}: {
  items: any[];
  basePath: string;
  emptyText: string;
  newPath: string;
  newLabel: string;
  extraColumns?: ExtraColumn[];
  showCoverage?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
        <p className="text-gray-500 mb-3 text-sm">{emptyText}</p>
        <Link
          to={newPath}
          className="inline-block px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          {newLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Name</th>
            {extraColumns?.map((col) => (
              <th key={col.header} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{col.header}</th>
            ))}
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Status</th>
            {showCoverage && (
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Coverage</th>
            )}
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {items.map((item: any) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link to={`${basePath}/${item.id}`} className="text-blue-600 hover:underline font-medium text-sm">
                  {item.title}
                </Link>
                {item.serviceName !== item.title && (
                  <div className="text-xs text-gray-400">{item.serviceName}</div>
                )}
              </td>
              {extraColumns?.map((col) => (
                <td key={col.header} className="px-4 py-2.5">{col.render(item)}</td>
              ))}
              <td className="px-4 py-2.5">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${PRACTICE_STATUS_COLORS[item.status] || ""}`}>
                  {item.status.replace(/_/g, " ")}
                </span>
              </td>
              {showCoverage && (
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${item.coveragePercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{item.coveragePercent}%</span>
                  </div>
                </td>
              )}
              <td className="px-4 py-2.5 text-xs text-gray-500">
                {new Date(item.updatedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
