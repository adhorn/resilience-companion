import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { LearningRadar } from "./LearningRadar";
import { PRIORITY_COLORS } from "../lib/style-constants";

interface Props {
  practiceType: "orr" | "incident";
  practiceId: string;
}

type ViewMode = "sections" | "dashboard" | "radar";

const VIEW_LABELS: Record<ViewMode, string> = {
  sections: "By Section",
  dashboard: "Dashboard",
  radar: "Interactive",
};

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

export function LearningPanel({ practiceType, practiceId }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("sections");
  const [focusedSection, setFocusedSection] = useState<string | null>(null);

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
  }, [load]);

  if (loading) {
    return <div className="p-6 text-gray-500 text-sm">Loading learning signals...</div>;
  }
  if (!data) {
    return <div className="p-6 text-red-500 text-sm">Failed to load learning data</div>;
  }

  const { sections, discoveries, crossPracticeLinks, actionItems, totals } = data;
  const hasSignals = totals.discoveries > 0 || totals.crossPracticeLinks > 0 || actionItems.length > 0 || totals.experiments > 0;

  // Group discoveries by section
  const discoveriesBySection = new Map<string | null, any[]>();
  for (const d of discoveries) {
    const key = d.sectionId;
    if (!discoveriesBySection.has(key)) discoveriesBySection.set(key, []);
    discoveriesBySection.get(key)!.push(d);
  }
  const sectionMap = new Map<string, any>(sections.map((s: any) => [s.id, s]));

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header: summary + view toggle */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-4 text-xs">
        <span className="text-gray-500">{totals.discoveries} surprise{totals.discoveries !== 1 ? "s" : ""}</span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">{totals.gaps} gap{totals.gaps !== 1 ? "s" : ""}</span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">{totals.crossPracticeLinks} connection{totals.crossPracticeLinks !== 1 ? "s" : ""}</span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">{totals.experiments} experiment{totals.experiments !== 1 ? "s" : ""}</span>

        <div className="ml-auto flex items-center gap-1">
          {(["sections", "dashboard", "radar"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                view === v
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
          <button onClick={load} className="ml-2 text-gray-400 hover:text-gray-600" title="Refresh">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311V15.5a.75.75 0 01-1.5 0v-4.25a.75.75 0 01.75-.75h4.25a.75.75 0 010 1.5H7.378l.313.312a4 4 0 006.693-1.794.75.75 0 011.428.45zM4.688 8.576a5.5 5.5 0 019.201-2.466l.312.311V4.5a.75.75 0 011.5 0v4.25a.75.75 0 01-.75.75h-4.25a.75.75 0 010-1.5h1.921l-.312-.312a4 4 0 00-6.694 1.794.75.75 0 01-1.428-.45z" clipRule="evenodd" /></svg>
          </button>
        </div>
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

      {hasSignals && view === "sections" && (
        <SectionView
          sections={sections}
          discoveriesBySection={discoveriesBySection}
          crossPracticeLinks={crossPracticeLinks}
          actionItems={actionItems}
        />
      )}

      {hasSignals && view === "dashboard" && (
        <DashboardView
          sections={sections}
          discoveries={discoveries}
          discoveriesBySection={discoveriesBySection}
          crossPracticeLinks={crossPracticeLinks}
          actionItems={actionItems}
          totals={totals}
        />
      )}

      {hasSignals && view === "radar" && (
        <RadarView
          sections={sections}
          discoveriesBySection={discoveriesBySection}
          sectionMap={sectionMap}
          focusedSection={focusedSection}
          setFocusedSection={setFocusedSection}
        />
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

// ─── View 1: Section-Centric ────────────────────────────────────────────────

function SectionView({ sections, discoveriesBySection, crossPracticeLinks, actionItems }: {
  sections: any[];
  discoveriesBySection: Map<string | null, any[]>;
  crossPracticeLinks: any[];
  actionItems: any[];
}) {
  return (
    <div className="p-4 space-y-3">
      {sections.map((s: any) => {
        const sectionDiscoveries = discoveriesBySection.get(s.id) || [];
        const hasContent = s.depth > 0 || sectionDiscoveries.length > 0 || s.gaps > 0 || s.codeSourced > 0;

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

      {/* Cross-practice + action items at bottom */}
      <CrossPracticeAndActions crossPracticeLinks={crossPracticeLinks} actionItems={actionItems} />
    </div>
  );
}

// ─── View 2: Dashboard Grid ─────────────────────────────────────────────────

function DashboardView({ sections, discoveries, discoveriesBySection, crossPracticeLinks, actionItems, totals }: {
  sections: any[];
  discoveries: any[];
  discoveriesBySection: Map<string | null, any[]>;
  crossPracticeLinks: any[];
  actionItems: any[];
  totals: any;
}) {
  const sectionNameMap = new Map(sections.map((s: any) => [s.id, s.title]));

  return (
    <div className="p-4 space-y-4">
      {/* Top row: radar + stats */}
      <div className="flex gap-4">
        {/* Radar */}
        <div className="flex-shrink-0">
          <LearningRadar
            sections={sections.map((s: any) => ({
              label: s.title,
              depth: s.depth,
              discoveries: s.discoveries,
              gaps: s.gaps,
            }))}
          />
          <div className="mt-1 flex justify-center gap-3 text-[9px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400" /> Deep
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" /> Moderate
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-400" /> Surface
            </span>
          </div>
        </div>

        {/* Stats cards */}
        <div className="flex-1 grid grid-cols-2 gap-2 content-start">
          <StatCard label="Surprises" value={totals.discoveries} color="amber" />
          <StatCard label="Gaps" value={totals.gaps} color="red" />
          <StatCard label="Connections" value={totals.crossPracticeLinks} color="indigo" />
          <StatCard label="Experiments" value={totals.experiments} color="purple" />

          {/* Coverage bar */}
          <div className="col-span-2 bg-gray-50 rounded-lg border border-gray-200 p-2">
            <div className="text-[10px] text-gray-400 mb-1.5">Section Depth</div>
            <div className="flex gap-0.5">
              {sections.map((s: any) => (
                <div
                  key={s.id}
                  className={`flex-1 h-3 rounded-sm ${DEPTH_BAR[s.depth]} relative group`}
                  title={`${s.title}: ${DEPTH_LABELS[s.depth]}`}
                >
                  {s.discoveries > 0 && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[8px] text-gray-400 mt-0.5">
              <span>1</span>
              <span>{sections.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column: Surprises | Blind Spots */}
      <div className="grid grid-cols-2 gap-4">
        {/* Surprises */}
        <div>
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Surprises</h4>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {discoveries.length === 0 && <p className="text-xs text-gray-400 italic">None yet</p>}
            {discoveries.map((d: any) => (
              <div key={d.id} className="bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                <p className="text-[11px] text-gray-700">{d.text}</p>
                {d.sectionId && (
                  <p className="text-[9px] text-gray-400 mt-0.5">{sectionNameMap.get(d.sectionId) || ""}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Blind Spots */}
        <div>
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Blind Spots</h4>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {sections.filter((s: any) => s.codeSourced > 0).length === 0 && (
              <p className="text-xs text-gray-400 italic">None detected</p>
            )}
            {sections.filter((s: any) => s.codeSourced > 0).map((s: any) => (
              <div key={s.id} className="bg-orange-50 border border-orange-200 rounded px-2.5 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-700">{s.title}</span>
                  <span className="text-[10px] text-orange-600 font-medium">{s.codeSourced} from code</span>
                </div>
                <div className="text-[9px] text-gray-400">{s.questionsAnswered} of {s.questionsTotal} answered</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cross-practice + action items */}
      <CrossPracticeAndActions crossPracticeLinks={crossPracticeLinks} actionItems={actionItems} />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
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

// ─── View 3: Interactive Radar ──────────────────────────────────────────────

function RadarView({ sections, discoveriesBySection, sectionMap, focusedSection, setFocusedSection }: {
  sections: any[];
  discoveriesBySection: Map<string | null, any[]>;
  sectionMap: Map<string, any>;
  focusedSection: string | null;
  setFocusedSection: (id: string | null) => void;
}) {
  const focused = focusedSection ? sectionMap.get(focusedSection) : null;
  const focusedDiscoveries = focusedSection ? (discoveriesBySection.get(focusedSection) || []) : [];

  return (
    <div className="p-4">
      <div className="flex gap-4">
        {/* Radar with click handlers */}
        <div className="flex-shrink-0 w-[280px]">
          <LearningRadar
            sections={sections.map((s: any) => ({
              label: s.title,
              depth: s.depth,
              discoveries: s.discoveries,
              gaps: s.gaps,
            }))}
            onSectionClick={(index: number) => {
              const s = sections[index];
              setFocusedSection(s.id === focusedSection ? null : s.id);
            }}
            focusedIndex={focusedSection ? sections.findIndex((s: any) => s.id === focusedSection) : -1}
          />
          <p className="text-[10px] text-gray-400 text-center mt-2">Click a section to see details</p>

          {/* Section list for easier selection */}
          <div className="mt-3 space-y-0.5">
            {sections.map((s: any) => (
              <button
                key={s.id}
                onClick={() => setFocusedSection(s.id === focusedSection ? null : s.id)}
                className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-2 transition-colors ${
                  s.id === focusedSection
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="flex gap-0.5 flex-shrink-0">
                  {[1, 2, 3].map((level) => (
                    <div
                      key={level}
                      className={`w-1.5 h-3 rounded-sm ${s.depth >= level ? DEPTH_BAR[level] : "bg-gray-200"}`}
                    />
                  ))}
                </div>
                <span className="truncate">{s.title}</span>
                {(discoveriesBySection.get(s.id) || []).length > 0 && (
                  <span className="ml-auto flex-shrink-0 text-[9px] bg-amber-100 text-amber-600 rounded-full px-1.5">
                    {(discoveriesBySection.get(s.id) || []).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0">
          {!focused ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Select a section to see its learning signals
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-gray-800">{focused.title}</h3>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${DEPTH_BG[focused.depth]} ${DEPTH_TEXT[focused.depth]}`}>
                  {DEPTH_LABELS[focused.depth]}
                </span>
              </div>

              {/* Stats */}
              <div className="flex gap-3 text-[10px] mb-3">
                <span className="text-gray-500">{focused.questionsAnswered}/{focused.questionsTotal} questions</span>
                {focused.gaps > 0 && <span className="text-red-500 font-medium">{focused.gaps} gaps</span>}
                {focused.codeSourced > 0 && <span className="text-orange-500 font-medium">{focused.codeSourced} blind spots</span>}
              </div>

              {/* Depth rationale */}
              {focused.depthRationale && (
                <div className="bg-gray-50 rounded border border-gray-200 p-2 mb-3">
                  <div className="text-[10px] text-gray-400 mb-0.5">Depth Rationale</div>
                  <p className="text-xs text-gray-600">{focused.depthRationale}</p>
                </div>
              )}

              {/* Discoveries */}
              {focusedDiscoveries.length > 0 ? (
                <div>
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1.5">
                    Surprises ({focusedDiscoveries.length})
                  </div>
                  <div className="space-y-1.5">
                    {focusedDiscoveries.map((d: any) => (
                      <div key={d.id} className="bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
                        <p className="text-xs text-gray-700">{d.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No surprises recorded for this section</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared: Cross-Practice + Actions ───────────────────────────────────────

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
