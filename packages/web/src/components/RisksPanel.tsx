import { api } from "../api/client";

const FLAG_COLORS: Record<string, string> = {
  RISK: "bg-red-100 text-red-700",
  GAP: "bg-amber-100 text-amber-700",
  STRENGTH: "bg-green-100 text-green-700",
  FOLLOW_UP: "bg-blue-100 text-blue-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-600 text-white",
  MEDIUM: "bg-orange-500 text-white",
  LOW: "bg-yellow-400 text-gray-900",
};

const STATUS_BADGE: Record<string, string> = {
  OPEN: "",
  ACCEPTED: "bg-purple-100 text-purple-700",
  RESOLVED: "bg-green-100 text-green-700",
};

interface Flag {
  type: string;
  note: string;
  severity?: string;
  deadline?: string;
  status?: string;
  resolution?: string;
}

interface FlagWithContext extends Flag {
  sectionId: string;
  sectionTitle: string;
  flagIndex: number;
}

interface Props {
  orrId: string;
  sections: any[];
  onNavigateToSection: (sectionId: string) => void;
  onReload: () => void;
}

export function RisksPanel({ orrId, sections, onNavigateToSection, onReload }: Props) {
  // Collect all flags from all sections with their section context
  const allFlags: FlagWithContext[] = [];
  for (const section of sections) {
    const flags: Flag[] = section.flags
      ? typeof section.flags === "string"
        ? JSON.parse(section.flags)
        : section.flags
      : [];
    for (let i = 0; i < flags.length; i++) {
      allFlags.push({
        ...flags[i],
        sectionId: section.id,
        sectionTitle: section.title,
        flagIndex: i,
      });
    }
  }

  if (allFlags.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-400 text-sm max-w-sm">
          <div className="mb-3">
            <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p>No flags raised yet.</p>
          <p className="mt-2 text-xs">
            The AI agent flags risks, gaps, and strengths during the review conversation.
            Use <span className="font-mono text-blue-500">/risks</span> to ask the AI to scan for issues.
          </p>
        </div>
      </div>
    );
  }

  // Group by type, with RISK first
  const typeOrder = ["RISK", "GAP", "FOLLOW_UP", "STRENGTH"];
  const openFlags = allFlags.filter((f) => !f.status || f.status === "OPEN");
  const resolvedFlags = allFlags.filter((f) => f.status === "ACCEPTED" || f.status === "RESOLVED");

  // Stats
  const highRisks = allFlags.filter((f) => f.type === "RISK" && f.severity === "HIGH" && f.status !== "RESOLVED" && f.status !== "ACCEPTED").length;
  const overdueCount = allFlags.filter((f) => f.type === "RISK" && f.deadline && new Date(f.deadline) < new Date() && f.status !== "RESOLVED" && f.status !== "ACCEPTED").length;

  const handleUpdateStatus = async (sectionId: string, flagIndex: number, status: string) => {
    const reason = status === "ACCEPTED"
      ? prompt("Why is this acceptable?")
      : status === "RESOLVED"
        ? prompt("What was done to resolve this?")
        : null;
    if (status !== "OPEN" && !reason) return;

    try {
      await api.flags.updateStatus(orrId, sectionId, flagIndex, {
        status,
        ...(reason ? { resolution: reason } : {}),
      });
      onReload();
    } catch {
      // silently fail
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Stats bar */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-4 text-xs">
        <span className="text-gray-500">{allFlags.length} flags across {new Set(allFlags.map((f) => f.sectionId)).size} sections</span>
        {highRisks > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-red-600 font-bold">{highRisks} HIGH risks open</span>
          </>
        )}
        {overdueCount > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-red-600 font-bold">{overdueCount} overdue</span>
          </>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Open flags grouped by type */}
        {typeOrder.map((type) => {
          const flags = openFlags.filter((f) => f.type === type);
          if (flags.length === 0) return null;

          // Sort risks by severity (HIGH first)
          if (type === "RISK") {
            const sevOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
            flags.sort((a, b) => (sevOrder[a.severity || "LOW"] ?? 3) - (sevOrder[b.severity || "LOW"] ?? 3));
          }

          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${FLAG_COLORS[type] || "bg-gray-100"}`}>
                  {type.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-gray-400">({flags.length})</span>
              </div>
              <div className="space-y-2">
                {flags.map((flag, i) => (
                  <FlagCard
                    key={`${flag.sectionId}-${flag.flagIndex}-${i}`}
                    flag={flag}
                    onNavigate={() => onNavigateToSection(flag.sectionId)}
                    onAccept={() => handleUpdateStatus(flag.sectionId, flag.flagIndex, "ACCEPTED")}
                    onResolve={() => handleUpdateStatus(flag.sectionId, flag.flagIndex, "RESOLVED")}
                    onReopen={() => handleUpdateStatus(flag.sectionId, flag.flagIndex, "OPEN")}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Resolved flags */}
        {resolvedFlags.length > 0 && (
          <div className="pt-2 border-t border-gray-200">
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">
              Resolved ({resolvedFlags.length})
            </div>
            <div className="space-y-2">
              {resolvedFlags.map((flag, i) => (
                <FlagCard
                  key={`resolved-${flag.sectionId}-${flag.flagIndex}-${i}`}
                  flag={flag}
                  onNavigate={() => onNavigateToSection(flag.sectionId)}
                  onAccept={() => handleUpdateStatus(flag.sectionId, flag.flagIndex, "ACCEPTED")}
                  onResolve={() => handleUpdateStatus(flag.sectionId, flag.flagIndex, "RESOLVED")}
                  onReopen={() => handleUpdateStatus(flag.sectionId, flag.flagIndex, "OPEN")}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FlagCard({
  flag,
  onNavigate,
  onAccept,
  onResolve,
  onReopen,
}: {
  flag: FlagWithContext;
  onNavigate: () => void;
  onAccept: () => void;
  onResolve: () => void;
  onReopen: () => void;
}) {
  const isResolved = flag.status === "RESOLVED" || flag.status === "ACCEPTED";
  const isOverdue = flag.type === "RISK" && flag.deadline && new Date(flag.deadline) < new Date() && !isResolved;

  return (
    <div className={`rounded border px-3 py-2 text-xs ${
      isResolved
        ? "border-gray-200 bg-gray-50 opacity-60"
        : flag.type === "RISK"
          ? "border-red-200 bg-red-50"
          : "border-gray-200 bg-white"
    }`}>
      <div className="flex items-center gap-2 flex-wrap">
        {flag.type === "RISK" && flag.severity && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SEVERITY_COLORS[flag.severity] || ""}`}>
            {flag.severity}
          </span>
        )}
        {flag.status && flag.status !== "OPEN" && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_BADGE[flag.status] || ""}`}>
            {flag.status}
          </span>
        )}
        {isOverdue && (
          <span className="text-[10px] text-red-600 font-bold">OVERDUE</span>
        )}
        {flag.deadline && !isOverdue && (
          <span className="text-[10px] text-gray-500">Due: {flag.deadline}</span>
        )}
        <button
          onClick={onNavigate}
          className="ml-auto text-[10px] text-blue-500 hover:text-blue-700 hover:underline"
        >
          {flag.sectionTitle}
        </button>
      </div>
      <div className="mt-1 text-gray-700">{flag.note}</div>
      {flag.resolution && (
        <div className="mt-1 text-gray-500 italic">
          {flag.status === "ACCEPTED" ? "Accepted" : "Resolved"}: {flag.resolution}
        </div>
      )}
      {/* Actions */}
      <div className="mt-1.5 flex gap-1">
        {!isResolved ? (
          <>
            <button onClick={onAccept} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 hover:bg-purple-100">
              Accept
            </button>
            <button onClick={onResolve} className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100">
              Resolve
            </button>
          </>
        ) : (
          <button onClick={onReopen} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200">
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
