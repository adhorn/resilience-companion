import React, { useEffect, useState } from "react";
import { api } from "../api/client";

export function Learn() {
  const [tab, setTab] = useState<"teaching" | "cases">("teaching");
  const [teachingMoments, setTeachingMoments] = useState<any[]>([]);
  const [caseStudies, setCaseStudies] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.teachingMoments.list(),
      api.caseStudies.list(),
    ])
      .then(([tm, cs]) => {
        setTeachingMoments(tm.teachingMoments);
        setCaseStudies(cs.caseStudies);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredTM = search
    ? teachingMoments.filter(
        (tm) =>
          tm.title.toLowerCase().includes(search.toLowerCase()) ||
          tm.content.toLowerCase().includes(search.toLowerCase()),
      )
    : teachingMoments;

  const filteredCS = search
    ? caseStudies.filter(
        (cs) =>
          cs.title.toLowerCase().includes(search.toLowerCase()) ||
          cs.summary.toLowerCase().includes(search.toLowerCase()) ||
          cs.company.toLowerCase().includes(search.toLowerCase()),
      )
    : caseStudies;

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Learn</h2>
      <p className="text-sm text-gray-500 mb-6">
        Industry lessons and real-world incidents to inform your operational readiness reviews.
        All content is from public sources.
      </p>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
        className="w-full max-w-sm mb-4 px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
      />

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab("teaching")}
          className={`pb-2 text-sm font-medium border-b-2 ${
            tab === "teaching"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Teaching Moments ({filteredTM.length})
        </button>
        <button
          onClick={() => setTab("cases")}
          className={`pb-2 text-sm font-medium border-b-2 ${
            tab === "cases"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Case Studies ({filteredCS.length})
        </button>
      </div>

      {/* Teaching moments */}
      {tab === "teaching" && (
        <div className="space-y-4">
          {filteredTM.map((tm) => {
            const tags = typeof tm.tags === "string" ? JSON.parse(tm.tags) : tm.tags;
            return (
              <div key={tm.id} className="bg-white rounded-lg shadow-sm border p-4">
                <h3 className="font-medium text-gray-900">{tm.title}</h3>
                <p className="text-sm text-gray-600 mt-2">{tm.content}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {tm.systemPattern && (
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-medium">
                      {tm.systemPattern}
                    </span>
                  )}
                  {tm.failureMode && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-medium">
                      {tm.failureMode}
                    </span>
                  )}
                  {(tags as string[]).map((tag: string) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Case studies */}
      {tab === "cases" && (
        <div className="space-y-4">
          {filteredCS.map((cs) => {
            const lessons = typeof cs.lessons === "string" ? JSON.parse(cs.lessons) : cs.lessons;
            return (
              <div key={cs.id} className="bg-white rounded-lg shadow-sm border p-4">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-gray-900">{cs.title}</h3>
                  {cs.sourceUrl && (
                    <a
                      href={cs.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline shrink-0 ml-2"
                    >
                      Source
                    </a>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {cs.company} {cs.year && `(${cs.year})`} — {cs.failureCategory}
                </div>
                <p className="text-sm text-gray-600 mt-2">{cs.summary}</p>
                {(lessons as string[]).length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">Lessons:</div>
                    <ul className="space-y-1">
                      {(lessons as string[]).map((lesson: string, i: number) => (
                        <li key={i} className="text-xs text-gray-600 pl-3 border-l-2 border-green-200">
                          {lesson}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
