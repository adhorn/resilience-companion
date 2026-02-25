import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { SignalRadar, RadarLegend, RADAR_COLORS } from "./LearningRadar";
import { PRIORITY_COLORS } from "../lib/style-constants";

interface Props {
  practiceType: "orr" | "incident";
  practiceId: string;
  refreshKey?: number;
}

const TARGET_PRACTICE_LABELS: Record<string, string> = {
  chaos_engineering: "Chaos Engineering",
  load_testing: "Load Testing",
  gameday: "Gameday",
  incident_analysis: "Incident Analysis",
  orr: "ORR",
};

const DEPTH_LABELS = ["Not reviewed", "Surface", "Moderate", "Deep"];
const DEPTH_BG = ["bg-gray-100", "bg-red-50", "bg-yellow-50", "bg-green-50"];
const DEPTH_BORDER = ["border-gray-200", "border-red-200", "border-yellow-200", "border-green-200"];
const DEPTH_TEXT = ["text-gray-400", "text-red-600", "text-yellow-600", "text-green-600"];
const DEPTH_BAR = ["bg-gray-300", "bg-red-400", "bg-yellow-400", "bg-green-500"];

export function LearningPanel({ practiceType, practiceId, refreshKey }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.learning.get(practiceType, practiceId);
      setData(res.learning);
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [practiceType, practiceId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return <div className="p-6 text-gray-500 text-sm">Loading learning signals...</div>;
  }
  if (!data) {
    return <div className="p-6 text-red-500 text-sm">Failed to load learning data</div>;
  }

  const { sections, discoveries, crossPracticeLinks, actionItems, totals } = data;
  const hasSignals = totals.totalInsights > 0 || totals.totalRisks > 0 || totals.crossPracticeLinks > 0 || actionItems.length > 0 || totals.experiments > 0 || sections.some((s: any) => s.depth > 0);

  // Group discoveries by section
  const discoveriesBySection = new Map<string | null, any[]>();
  for (const d of discoveries) {
    const key = d.sectionId;
    if (!discoveriesBySection.has(key)) discoveriesBySection.set(key, []);
    discoveriesBySection.get(key)!.push(d);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header: summary counts + refresh */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-4 text-xs">
        <span className="text-green-600">{totals.depthCoverage} sections at moderate+ depth</span>
        <span className="text-gray-300">|</span>
        <span className="text-red-500">{totals.totalRisks} open risk{totals.totalRisks !== 1 ? "s" : ""}</span>
        <span className="text-gray-300">|</span>
        <span className="text-amber-500">{totals.totalInsights} insight{totals.totalInsights !== 1 ? "s" : ""}</span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">{totals.crossPracticeLinks} connection{totals.crossPracticeLinks !== 1 ? "s" : ""}</span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">{totals.experiments} experiment{totals.experiments !== 1 ? "s" : ""}</span>

        <button onClick={load} className="ml-auto text-gray-400 hover:text-gray-600" title="Refresh">
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311V15.5a.75.75 0 01-1.5 0v-4.25a.75.75 0 01.75-.75h4.25a.75.75 0 010 1.5H7.378l.313.312a4 4 0 006.693-1.794.75.75 0 011.428.45zM4.688 8.576a5.5 5.5 0 019.201-2.466l.312.311V4.5a.75.75 0 011.5 0v4.25a.75.75 0 01-.75.75h-4.25a.75.75 0 010-1.5h1.921l-.312-.312a4 4 0 00-6.694 1.794.75.75 0 01-1.428-.45z" clipRule="evenodd" /></svg>
        </button>
      </div>

      {/* Empty state */}
      {!hasSignals && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center text-gray-400 text-sm max-w-sm">
            <p>No learning signals yet.</p>
            <p className="mt-2 text-xs">
              Start an AI session to explore your system's operational readiness.
              Use <code className="bg-gray-100 px-1 rounded">/learning</code> to extract signals from past conversations.
            </p>
          </div>
        </div>
      )}

      {hasSignals && (
        <div className="p-4 space-y-4">
          {/* ── Signal radars: Strengths, Surprises, Gaps ── */}
          <div className="grid grid-cols-3 gap-2">
            <SignalRadar
              title="Depth"
              axes={sections.map((s: any) => ({ label: s.title, value: s.depth }))}
              color={RADAR_COLORS.strengths}
            />
            <SignalRadar
              title="Risks"
              axes={sections.map((s: any) => ({ label: s.title, value: s.riskScore }))}
              color={RADAR_COLORS.gaps}
            />
            <SignalRadar
              title="Insights"
              axes={sections.map((s: any) => ({ label: s.title, value: s.insightCount }))}
              color={RADAR_COLORS.surprises}
            />
          </div>
          <RadarLegend sections={sections.map((s: any) => ({ position: s.position, title: s.title }))} />

          {/* ── Stats + coverage ── */}
          <div className="grid grid-cols-4 gap-2">
            <StatCard label="Depth" value={totals.depthCoverage} color="green" />
            <StatCard label="Risks" value={totals.totalRisks} color="red" />
            <StatCard label="Insights" value={totals.totalInsights} color="amber" />
            <StatCard label="Connections" value={totals.crossPracticeLinks} color="indigo" />
          </div>

          {/* Section depth coverage bar */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-2">
            <div className="text-[10px] text-gray-400 mb-1.5">Section Depth</div>
            <div className="flex gap-0.5">
              {sections.map((s: any) => (
                <div
                  key={s.id}
                  className={`flex-1 h-5 rounded-sm ${DEPTH_BAR[s.depth]} relative group flex items-center justify-center`}
                  title={`${s.title}: ${DEPTH_LABELS[s.depth]}`}
                >
                  <span className="text-[8px] font-bold text-white/80 leading-none">{s.position}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-4 mt-1.5 text-[9px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" /> Deep</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-400 inline-block" /> Moderate</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" /> Surface</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-300 inline-block" /> Not reviewed</span>
            </div>
          </div>

          {/* ── Section cards ── */}
          <div className="space-y-3">
            {sections.map((s: any) => {
              const sectionDiscoveries = discoveriesBySection.get(s.id) || [];
              const hasContent = s.depth > 0 || sectionDiscoveries.length > 0 || s.gaps > 0 || s.strengths > 0 || s.codeSourced > 0;

              return (
                <div
                  key={s.id}
                  className={`rounded-lg border ${DEPTH_BORDER[s.depth]} ${hasContent ? DEPTH_BG[s.depth] : "bg-gray-50 border-gray-100 opacity-60"} p-3`}
                >
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium text-gray-600">{s.position}.</span>
                    <span className="text-sm font-medium text-gray-800 flex-1">{s.title}</span>
                    {/* Depth bar */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        {[1, 2, 3].map((level) => (
                          <div
                            key={level}
                            className={`w-2 h-5 rounded-sm ${s.depth >= level ? DEPTH_BAR[level] : "bg-gray-200"}`}
                          />
                        ))}
                      </div>
                      <span className={`text-[10px] font-medium ${DEPTH_TEXT[s.depth]}`}>
                        {DEPTH_LABELS[s.depth]}
                      </span>
                    </div>
                  </div>

                  {/* Stats row */}
                  {hasContent && (
                    <div className="flex gap-3 text-[10px] mb-2">
                      <span className="text-gray-500">{s.questionsAnswered}/{s.questionsTotal} questions</span>
                      {s.strengths > 0 && (
                        <span className="text-green-600 font-medium">{s.strengths} strength{s.strengths !== 1 ? "s" : ""}</span>
                      )}
                      {sectionDiscoveries.length > 0 && (
                        <span className="text-amber-600 font-medium">{sectionDiscoveries.length} surprise{sectionDiscoveries.length !== 1 ? "s" : ""}</span>
                      )}
                      {s.gaps > 0 && (
                        <span className="text-red-500 font-medium">{s.gaps} gap{s.gaps !== 1 ? "s" : ""}</span>
                      )}
                      {s.codeSourced > 0 && (
                        <span className="text-orange-500 font-medium">{s.codeSourced} blind spot{s.codeSourced !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  )}

                  {/* Depth rationale */}
                  {s.depthRationale && (
                    <p className="text-[11px] text-gray-500 italic mb-2">{s.depthRationale}</p>
                  )}

                  {/* Strengths */}
                  {s.strengthNotes?.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {s.strengthNotes.map((note: string, idx: number) => (
                        <div key={`str-${idx}`} className="bg-white/70 border border-green-200/60 rounded px-2.5 py-1.5">
                          <p className="text-xs text-gray-700">{note}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Discoveries */}
                  {sectionDiscoveries.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {sectionDiscoveries.map((d: any) => (
                        <div key={d.id} className="bg-white/70 border border-amber-200/60 rounded px-2.5 py-1.5">
                          <p className="text-xs text-gray-700">{d.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Cross-section discoveries */}
            {discoveriesBySection.has(null) && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <div className="text-sm font-medium text-indigo-800 mb-2">Cross-Section</div>
                <div className="space-y-1.5">
                  {discoveriesBySection.get(null)!.map((d: any) => (
                    <div key={d.id} className="bg-white/70 border border-indigo-200/60 rounded px-2.5 py-1.5">
                      <p className="text-xs text-gray-700">{d.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cross-practice + action items */}
            <CrossPracticeAndActions crossPracticeLinks={crossPracticeLinks} actionItems={actionItems} />
          </div>
        </div>
      )}

      {/* Anti-surrogation reminder */}
      {hasSignals && (
        <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
          These signals describe what the team explored, not how "ready" the system is.
          What matters: did anything surprise you? Did your mental model change? Are there untested assumptions?
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: "bg-green-50 border-green-200 text-green-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };
  return (
    <div className={`rounded-lg border p-2 ${colors[color]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] opacity-70">{label}</div>
    </div>
  );
}

// ─── Cross-Practice + Actions ────────────────────────────────────────────────

function CrossPracticeAndActions({ crossPracticeLinks, actionItems }: {
  crossPracticeLinks: any[];
  actionItems: any[];
}) {
  if (crossPracticeLinks.length === 0 && actionItems.length === 0) return null;

  return (
    <>
      {crossPracticeLinks.length > 0 && (
        <div>
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Cross-Practice Connections</h4>
          <div className="space-y-1.5">
            {crossPracticeLinks.map((link: any) => (
              <div key={link.id} className="bg-indigo-50 border border-indigo-200 rounded px-2.5 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
                    {TARGET_PRACTICE_LABELS[link.targetPracticeType] || link.targetPracticeType}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    link.status === "accepted" ? "bg-green-100 text-green-700" :
                    link.status === "dismissed" ? "bg-gray-100 text-gray-400" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {link.status}
                  </span>
                </div>
                <p className="text-xs text-gray-700">{link.suggestion}</p>
                {link.rationale && <p className="text-[11px] text-gray-500 mt-1">{link.rationale}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {actionItems.length > 0 && (
        <div>
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Action Items</h4>
          <div className="space-y-1.5">
            {actionItems.map((a: any) => {
              const isDone = a.status === "done";
              return (
                <div key={a.id} className={`bg-white border border-gray-200 rounded px-2.5 py-2 ${isDone ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORITY_COLORS[a.priority] || ""}`}>
                      {a.priority}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      a.status === "done" ? "bg-green-100 text-green-700" :
                      a.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {a.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 mt-1">{a.title}</p>
                  <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                    {a.owner && <span>Owner: {a.owner}</span>}
                    {a.dueDate && <span>Due: {a.dueDate}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
