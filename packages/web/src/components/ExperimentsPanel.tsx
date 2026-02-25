import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { EXPERIMENT_TYPE_COLORS, EXPERIMENT_STATUS_COLORS, PRIORITY_COLORS } from "../lib/style-constants";

interface Experiment {
  id: string;
  serviceId: string;
  sourcePracticeType: string;
  sourcePracticeId: string;
  sourceSectionId: string | null;
  type: string;
  title: string;
  hypothesis: string;
  rationale: string;
  priority: string;
  priorityReasoning: string;
  blastRadiusNotes: string | null;
  status: string;
  dismissedReason: string | null;
  completedAt: string | null;
  completedNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  chaos_experiment: "Chaos Experiment",
  load_test: "Load Test",
  gameday: "Gameday",
};


interface Props {
  practiceType: "orr" | "incident";
  practiceId: string;
}

export function ExperimentsPanel({ practiceType, practiceId }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadExperiments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.experiments.list(practiceType, practiceId);
      setExperiments(res.experiments);
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [practiceType, practiceId]);

  useEffect(() => {
    loadExperiments();
  }, [loadExperiments]);

  const updateStatus = async (id: string, status: string, extra?: { dismissedReason?: string; completedNotes?: string }) => {
    try {
      await api.experiments.update(id, { status, ...extra });
      await loadExperiments();
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-500 text-sm">Loading experiments...</div>;
  }

  if (experiments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-400 text-sm max-w-sm">
          <div className="mb-3">
            <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <p>No experiment suggestions yet.</p>
          <p className="mt-2 text-xs">
            Use the <span className="font-mono text-blue-500">/experiments</span> command
            to have the AI suggest chaos experiments, load tests, or gamedays based on your review.
          </p>
        </div>
      </div>
    );
  }

  const active = experiments.filter((e) => e.status !== "dismissed" && e.status !== "completed");
  const resolved = experiments.filter((e) => e.status === "dismissed" || e.status === "completed");

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Stats */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-4 text-xs">
        <span className="text-gray-500">{experiments.length} suggestions</span>
        {active.length > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-blue-600">{active.length} active</span>
          </>
        )}
        {resolved.length > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-gray-400">{resolved.length} resolved</span>
          </>
        )}
        <button onClick={loadExperiments} className="ml-auto text-gray-400 hover:text-gray-600">Refresh</button>
      </div>

      <div className="p-4 space-y-3">
        {/* Active experiments first */}
        {active.map((exp) => (
          <ExperimentCard
            key={exp.id}
            experiment={exp}
            expanded={expandedId === exp.id}
            onToggle={() => setExpandedId(expandedId === exp.id ? null : exp.id)}
            onUpdateStatus={updateStatus}
          />
        ))}

        {/* Resolved experiments */}
        {resolved.length > 0 && active.length > 0 && (
          <div className="pt-2 border-t border-gray-200">
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Resolved</div>
          </div>
        )}
        {resolved.map((exp) => (
          <ExperimentCard
            key={exp.id}
            experiment={exp}
            expanded={expandedId === exp.id}
            onToggle={() => setExpandedId(expandedId === exp.id ? null : exp.id)}
            onUpdateStatus={updateStatus}
          />
        ))}
      </div>
    </div>
  );
}

function ExperimentCard({
  experiment: exp,
  expanded,
  onToggle,
  onUpdateStatus,
}: {
  experiment: Experiment;
  expanded: boolean;
  onToggle: () => void;
  onUpdateStatus: (id: string, status: string, extra?: { dismissedReason?: string; completedNotes?: string }) => void;
}) {
  const isResolved = exp.status === "dismissed" || exp.status === "completed";

  return (
    <div className={`bg-white border rounded-lg ${isResolved ? "opacity-60" : ""}`}>
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${EXPERIMENT_TYPE_COLORS[exp.type] || "bg-gray-100"}`}>
              {TYPE_LABELS[exp.type] || exp.type}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORITY_COLORS[exp.priority] || ""}`}>
              {exp.priority}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${EXPERIMENT_STATUS_COLORS[exp.status] || ""}`}>
              {exp.status}
            </span>
          </div>
          <h4 className="text-sm font-medium text-gray-900 mt-1">{exp.title}</h4>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{exp.hypothesis}</p>
        </div>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          <div>
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Hypothesis</div>
            <p className="text-sm text-gray-700 mt-0.5">{exp.hypothesis}</p>
          </div>
          <div>
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Rationale</div>
            <p className="text-sm text-gray-700 mt-0.5">{exp.rationale}</p>
          </div>
          <div>
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Priority Reasoning</div>
            <p className="text-sm text-gray-700 mt-0.5">{exp.priorityReasoning}</p>
          </div>
          {exp.blastRadiusNotes && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Blast Radius</div>
              <p className="text-sm text-gray-700 mt-0.5">{exp.blastRadiusNotes}</p>
            </div>
          )}
          {exp.dismissedReason && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Dismissed Reason</div>
              <p className="text-sm text-gray-500 mt-0.5 italic">{exp.dismissedReason}</p>
            </div>
          )}
          {exp.completedNotes && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Completion Notes</div>
              <p className="text-sm text-gray-700 mt-0.5">{exp.completedNotes}</p>
            </div>
          )}

          {/* Action buttons */}
          {!isResolved && (
            <div className="flex gap-2 pt-1">
              {exp.status === "suggested" && (
                <button
                  onClick={() => onUpdateStatus(exp.id, "accepted")}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Accept
                </button>
              )}
              {exp.status === "accepted" && (
                <button
                  onClick={() => onUpdateStatus(exp.id, "scheduled")}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Mark Scheduled
                </button>
              )}
              {(exp.status === "accepted" || exp.status === "scheduled") && (
                <button
                  onClick={() => {
                    const notes = prompt("What were the results?");
                    if (notes !== null) onUpdateStatus(exp.id, "completed", { completedNotes: notes });
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Mark Completed
                </button>
              )}
              <button
                onClick={() => {
                  const reason = prompt("Why dismiss this experiment?");
                  if (reason) onUpdateStatus(exp.id, "dismissed", { dismissedReason: reason });
                }}
                className="px-3 py-1.5 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
              >
                Dismiss
              </button>
            </div>
          )}
          {isResolved && (
            <div className="pt-1">
              <button
                onClick={() => onUpdateStatus(exp.id, "suggested")}
                className="px-3 py-1.5 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
              >
                Reopen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
