import { useEffect, useState } from "react";
import { api } from "../api/client";
import { PRIORITY_COLORS } from "../lib/style-constants";

interface Discovery {
  text: string;
  practiceId: string;
  practiceName: string;
  date: string;
}

interface CrossPracticeLink {
  id: string;
  sourcePracticeName: string;
  sourcePracticeType: string;
  targetPracticeType: string;
  suggestion: string;
  rationale: string;
  status: string;
  createdAt: string;
}

interface ActionItem {
  id: string;
  title: string;
  practiceName: string;
  practiceType: string;
  owner: string | null;
  dueDate: string | null;
  priority: string;
  type: string;
  status: string;
  successCriteria: string | null;
  createdAt: string;
}

export function Insights() {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [crossLinks, setCrossLinks] = useState<CrossPracticeLink[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.insights
      .get()
      .then((res) => {
        setDiscoveries(res.discoveries);
        setCrossLinks(res.crossPracticeLinks);
        setActionItems(res.actionItems);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  const hasData = discoveries.length > 0 || crossLinks.length > 0 || actionItems.length > 0;

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Learning Insights</h2>
      <p className="text-sm text-gray-500 mb-6">
        Discoveries, cross-practice connections, and open actions surfaced across all reviews and analyses.
      </p>

      {!hasData ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <p className="text-gray-500 mb-2">No learning signals yet.</p>
          <p className="text-sm text-gray-400">
            As you conduct ORR reviews and incident analyses, discoveries, cross-practice suggestions, and action items will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Discoveries */}
          {discoveries.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Discoveries
                <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                  Things that surprised the team (last 90 days)
                </span>
              </h3>
              <div className="space-y-2">
                {discoveries.map((d, i) => (
                  <div key={i} className="bg-white border rounded-lg px-4 py-3">
                    <p className="text-sm text-gray-800">{d.text}</p>
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-400">
                      <span>{d.practiceName}</span>
                      <span>{new Date(d.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Cross-Practice Links */}
          {crossLinks.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Cross-Practice Connections
                <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                  How findings from one practice inform another
                </span>
              </h3>
              <div className="space-y-2">
                {crossLinks.map((link) => (
                  <div key={link.id} className="bg-white border rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                        {link.sourcePracticeType}
                      </span>
                      <span className="text-[10px] text-gray-400">&rarr;</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700">
                        {link.targetPracticeType.replace(/_/g, " ")}
                      </span>
                      <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        link.status === "accepted" ? "bg-green-100 text-green-700" :
                        link.status === "dismissed" ? "bg-gray-100 text-gray-500" :
                        "bg-yellow-50 text-yellow-700"
                      }`}>
                        {link.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">{link.suggestion}</p>
                    <p className="text-xs text-gray-500 mt-1">{link.rationale}</p>
                    <div className="mt-1.5 text-[10px] text-gray-400">
                      from {link.sourcePracticeName} &middot; {new Date(link.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Open Action Items */}
          {actionItems.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Open Actions
                <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                  Items needing attention across all practices
                </span>
              </h3>
              <div className="bg-white border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Action</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Source</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Priority</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Owner</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {actionItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="text-sm text-gray-900">{item.title}</div>
                          {item.successCriteria && (
                            <div className="text-[10px] text-gray-400 mt-0.5">{item.successCriteria}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs text-gray-600">{item.practiceName}</div>
                          <div className="text-[10px] text-gray-400">{item.practiceType}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLORS[item.priority] || "bg-gray-100 text-gray-600"}`}>
                            {item.priority}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">{item.type}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">{item.owner || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            item.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                          }`}>
                            {item.status.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
