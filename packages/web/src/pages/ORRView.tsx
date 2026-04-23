import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { DependenciesPanel } from "../components/DependenciesPanel";
import { ExperimentsPanel } from "../components/ExperimentsPanel";
import { RisksPanel } from "../components/RisksPanel";
import { LearningPanel } from "../components/LearningPanel";
import { ConversationPanel } from "../components/ConversationPanel";
import { DEPTH_COLORS, DEPTH_LABELS, FLAG_COLORS, SEVERITY_COLORS_BOLD } from "../lib/style-constants";
import { renderMarkdown } from "../lib/markdown";
import { parseResponses, getResponseText, getResponseSource, getResponseCodeRef, answeredCount, codeSourcedCount, totalQuestions } from "../lib/responses";
import { useReviewSession, SlashCommand } from "../hooks/useReviewSession";

type WorkspaceTab = "review" | "risks" | "experiments" | "dependencies" | "learning";

const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "dependencies",
    description: "Map all dependencies from what we've discussed",
    prompt: 'First, call read_section for each section that has answers (check the section overview — any section marked with answered questions). Read the actual answer text to find mentioned services, databases, APIs, queues, caches, and infrastructure. Then check the Already Recorded Dependencies list and identify any that are NOT already recorded. Respond with a JSON object: { "command": "dependencies", "summary": "brief summary", "items": [{ "name": "...", "type": "database|cache|api|service|infrastructure|other", "criticality": "critical|important|optional", "notes": "..." }] }. Only include genuinely new dependencies.',
  },
  {
    name: "summarize",
    description: "Summarize the review so far",
    prompt: "Summarize our review progress so far. For each section we've discussed, give a brief overview of what we covered, the current depth assessment, and any key risks or gaps identified. Highlight what's going well and where we need more work.",
  },
  {
    name: "depth",
    description: "Assess depth of the current section",
    prompt: "Based on our conversation about this section, give me your honest depth assessment. What indicators did you observe? What would it take to move deeper? Be specific about what evidence you're basing this on.",
  },
  {
    name: "incidents",
    description: "Find relevant real-world incidents",
    prompt: "Based on what we've discussed in this section, search for relevant real-world incidents and case studies that connect to our architecture and approach. Use query_case_studies and query_teaching_moments to find matches, then share the most relevant ones and ask how our setup compares.",
  },
  {
    name: "status",
    description: "Show overall ORR review status",
    prompt: "Give me a status overview of this entire ORR. For each section: depth level, number of questions answered, any flags raised. Then highlight the top 3 things we should focus on next and why.",
  },
  {
    name: "risks",
    description: "List all identified risks and gaps",
    prompt: "List every risk and gap that's been flagged across all sections. Group them by severity. For each one, remind me what the concern is and whether it has a deadline or resolution. What's the most critical thing we haven't addressed?",
  },
  {
    name: "experiments",
    description: "Suggest chaos experiments, load tests, or gamedays",
    prompt: 'Review all sections we\'ve discussed so far. Check the Already Suggested Experiments list to avoid duplicates. Identify the 2-3 highest-ROI NEW experiments. Respond with a JSON object: { "command": "experiments", "summary": "brief summary", "items": [{ "type": "chaos_experiment|load_test|gameday", "title": "...", "hypothesis": "When X happens, we expect Y", "rationale": "...", "priority": "critical|high|medium|low" }] }. If no new experiments to suggest, return empty items array.',
  },
  {
    name: "learning",
    description: "Extract learning signals from all sections",
    prompt: 'Review all sections for learning signals using the section summaries already in your context. For each surprise, mental model change, WAI-WAD gap, or blind spot, be specific. Respond with a JSON object: { "command": "learning", "summary": "overall learning quality assessment", "items": [{ "text": "specific discovery description", "section_id": "optional section id" }] }. If nothing substantive to report yet, return empty items with a summary explaining why.',
  },
];

/** Collapsible panel showing parent Service ORR context for Feature ORRs. */
function ParentContextPanel({ parentOrr }: { parentOrr: any }) {
  const [expanded, setExpanded] = useState(false);
  const sectionsWithContent = (parentOrr.sections || []).filter((s: any) => s.hasContent);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  if (sectionsWithContent.length === 0) return null;

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <svg
          className={`w-3 h-3 text-blue-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-medium text-blue-700">
          Parent ORR: {parentOrr.serviceName}
        </span>
        <span className="text-[10px] text-blue-500 ml-auto">
          {sectionsWithContent.length} section{sectionsWithContent.length !== 1 ? "s" : ""} with content
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[10px] text-blue-600 mb-2">
            Reference material from the parent service ORR. Check if your change affects what was established.
          </p>
          {sectionsWithContent.map((s: any) => {
            const isOpen = expandedSections.has(s.id);
            const flags = typeof s.flags === "string" ? JSON.parse(s.flags) : (s.flags || []);
            return (
              <div key={s.id} className="rounded border border-blue-100 bg-white">
                <button
                  onClick={() => toggleSection(s.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
                >
                  <svg
                    className={`w-2.5 h-2.5 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DEPTH_COLORS[s.depth]}`} />
                  <span className="text-xs text-gray-700 font-medium">{s.title}</span>
                  {flags.length > 0 && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-red-50 text-red-600">
                      {flags.length} flag{flags.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="px-2.5 pb-2.5 border-t border-blue-50">
                    {s.content && (
                      <div className="mt-2 text-xs text-gray-600 leading-relaxed">
                        {renderMarkdown(s.content)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <Link
            to={`/orrs/${parentOrr.id}`}
            className="block text-[10px] text-blue-600 hover:underline mt-1"
          >
            Open full parent ORR
          </Link>
        </div>
      )}
    </div>
  );
}

export function ORRView() {
  const { id } = useParams<{ id: string }>();
  const [orr, setOrr] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("review");
  const [parentOrr, setParentOrr] = useState<any>(null);
  const [childOrrs, setChildOrrs] = useState<any[]>([]);
  const [pendingSuggestions, setPendingSuggestions] = useState<any[]>([]);
  const [featureSuggestions, setFeatureSuggestions] = useState<any[]>([]);

  const [learningRefreshKey, setLearningRefreshKey] = useState(0);

  // Repo connection
  const [showRepoForm, setShowRepoForm] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoToken, setRepoToken] = useState("");
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoError, setRepoError] = useState("");

  const reloadData = useCallback(async () => {
    if (!id) return;
    const res = await api.orrs.get(id) as any;
    setOrr(res.orr);
    setSections(res.sections.sort((a: any, b: any) => a.position - b.position));
    if (res.parentOrr) setParentOrr(res.parentOrr);
    if (res.childOrrs) setChildOrrs(res.childOrrs);
    if (res.pendingSuggestions) setPendingSuggestions(res.pendingSuggestions);
    if (res.featureSuggestions) setFeatureSuggestions(res.featureSuggestions);
    setLearningRefreshKey((k) => k + 1);
  }, [id]);

  const saveResponses = useCallback(
    async (sectionId: string, responses: Record<number, string>) => {
      if (!id) return;
      await api.sections.update(id, sectionId, { promptResponses: responses });
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, promptResponses: responses } : s)),
      );
    },
    [id],
  );

  const session = useReviewSession({
    practiceId: id,
    buildMessageUrl: (practiceId, sessionId) =>
      `/api/v1/orrs/${practiceId}/sessions/${sessionId}/messages`,
    reloadData,
    activeSection,
    setActiveSection,
    slashCommands: SLASH_COMMANDS,
    sections,
    saveResponses,
  });

  // Load ORR + restore active session
  useEffect(() => {
    if (!id) return;

    async function loadORR() {
      try {
        const orrRes = await api.orrs.get(id!) as any;
        setOrr(orrRes.orr);
        const sorted = orrRes.sections.sort((a: any, b: any) => a.position - b.position);
        setSections(sorted);
        if (orrRes.parentOrr) setParentOrr(orrRes.parentOrr);
        if (orrRes.childOrrs) setChildOrrs(orrRes.childOrrs);
        if (orrRes.pendingSuggestions) setPendingSuggestions(orrRes.pendingSuggestions);
        if (orrRes.featureSuggestions) setFeatureSuggestions(orrRes.featureSuggestions);
        if (sorted.length > 0) setActiveSection(sorted[0].id);

        const sessRes = await api.sessions.list(id!);
        const activeSession = sessRes.sessions.find((s: any) => s.status === "ACTIVE");
        if (activeSession) {
          session.setSessionId(activeSession.id);
          session.setSessionTokens(activeSession.tokenUsage || 0);
        }

        const msgRes = await api.sessions.getAllMessages(id!);
        if (msgRes.messages.length > 0) {
          const slashCommands = ["experiments", "dependencies", "learning", "actions", "timeline", "factors"];
          session.setMessages(
            msgRes.messages.map((m: any, i: number, arr: any[]) => {
              const msg: any = { role: m.role as "user" | "assistant", content: m.content };
              // Reconstruct slashResult for slash command responses loaded from DB
              if (m.role === "assistant" && i > 0) {
                const prev = arr[i - 1];
                if (prev.role === "user" && prev.content.startsWith("/") && slashCommands.includes(prev.content.slice(1))) {
                  try {
                    const jsonMatch = m.content.match(/\{[\s\S]*"command"[\s\S]*"items"[\s\S]*\}/);
                    if (jsonMatch) {
                      const parsed = JSON.parse(jsonMatch[0]);
                      if (parsed.command && Array.isArray(parsed.items)) {
                        msg.slashResult = parsed;
                        msg.content = parsed.summary || "";
                      }
                    }
                  } catch { /* not valid JSON, render as text */ }
                }
              }
              return msg;
            }),
          );
        }
      } finally {
        setLoading(false);
      }
    }

    loadORR();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startSession = useCallback(async () => {
    if (!id) return;
    const res = await api.sessions.create(id);
    session.setSessionId(res.session.id);
    session.setSessionTokens(0);
    if (res.session.welcomeMessage) {
      session.setMessages([{ role: "assistant", content: res.session.welcomeMessage }]);
    } else {
      session.setMessages([]);
    }
  }, [id, session]);

  const endSession = useCallback(async () => {
    if (!id || !session.sessionId) return;
    await api.sessions.end(id, session.sessionId);
    session.setSessionId(null);
    await reloadData();
  }, [id, session, reloadData]);

  const handleRepoSubmit = useCallback(async () => {
    if (!id || !repoUrl.trim()) return;
    setRepoSaving(true);
    setRepoError("");
    try {
      const data: Record<string, string> = { repositoryUrl: repoUrl.trim() };
      if (repoToken.trim()) data.repositoryToken = repoToken.trim();
      const res = await api.orrs.update(id, data);
      setOrr(res.orr);
      setShowRepoForm(false);
      setRepoUrl("");
      setRepoToken("");
    } catch (err) {
      setRepoError((err as Error).message);
    } finally {
      setRepoSaving(false);
    }
  }, [id, repoUrl, repoToken]);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!orr) return <div className="p-6 text-red-500">ORR not found</div>;

  const currentSection = sections.find((s) => s.id === activeSection);
  const currentPrompts = currentSection
    ? typeof currentSection.prompts === "string"
      ? JSON.parse(currentSection.prompts)
      : currentSection.prompts
    : [];
  const currentFlags = currentSection
    ? typeof currentSection.flags === "string"
      ? JSON.parse(currentSection.flags)
      : currentSection.flags
    : [];
  const savedResponses = parseResponses(currentSection);
  const isReadOnly = orr.status === "TERMINATED" || orr.status === "ARCHIVED";

  return (
    <div className="flex h-screen">
      {/* Column 1: Section sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50 overflow-hidden">
        <div className="p-3 border-b border-gray-200">
          <Link to="/orrs" className="text-[10px] text-gray-400 hover:text-blue-600">&larr; All ORRs</Link>
          <h2 className="font-bold text-sm text-gray-900 truncate mt-1">{orr.serviceName}</h2>
          <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1.5">
            <span>{orr.status.replace(/_/g, " ")}</span>
            <span
              className={`px-1.5 py-0.5 rounded font-medium ${
                orr.orrType === "feature"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {orr.orrType === "feature" ? "Feature" : "Service"}
            </span>
            {orr.status === "TERMINATED" && orr.terminationReason && (
              <span className="block mt-0.5 text-red-600" title={orr.terminationReason}>
                Reason: {orr.terminationReason.length > 60 ? orr.terminationReason.slice(0, 60) + "..." : orr.terminationReason}
              </span>
            )}
          </div>

          {/* Feature ORR context */}
          {orr.orrType === "feature" && (
            <div className="mt-1.5 space-y-1">
              {orr.changeTypes && orr.changeTypes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(typeof orr.changeTypes === "string" ? JSON.parse(orr.changeTypes) : orr.changeTypes).map((ct: string) => (
                    <span key={ct} className="px-1 py-0.5 rounded bg-purple-50 text-purple-600 text-[9px]">
                      {ct.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              {orr.changeDescription && (
                <p className="text-[10px] text-gray-500 line-clamp-3" title={orr.changeDescription}>
                  {orr.changeDescription}
                </p>
              )}
              {orr.parentOrrId && parentOrr && (
                <Link
                  to={`/orrs/${orr.parentOrrId}`}
                  className="text-[10px] text-blue-600 hover:underline block"
                >
                  Parent: {parentOrr.serviceName}
                </Link>
              )}
              {featureSuggestions.length > 0 && (
                <div className="mt-1">
                  <span className="text-[9px] text-amber-600">
                    {featureSuggestions.filter((s: any) => s.status === "suggested").length} pending update{featureSuggestions.filter((s: any) => s.status === "suggested").length !== 1 ? "s" : ""} to parent
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Steering tier */}
          <select
            value={orr.steeringTier || "thorough"}
            onChange={async (e) => {
              const tier = e.target.value;
              setOrr({ ...orr, steeringTier: tier });
              await api.orrs.update(id!, { steeringTier: tier });
            }}
            disabled={isReadOnly}
            className={`mt-1.5 w-full text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-white text-gray-700 ${isReadOnly ? "opacity-50 cursor-not-allowed" : ""}`}
            title="Agent steering rigor — controls how strictly the AI follows review workflow rules"
          >
            <option value="standard">Standard — fast, fewer checks</option>
            <option value="thorough">Thorough — balanced (default)</option>
            <option value="rigorous">Rigorous — strict validation</option>
          </select>

          {/* Repo connection */}
          {orr.repositoryPath && !showRepoForm ? (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-green-600" title={orr.repositoryPath}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
              <span className="truncate">{orr.repositoryPath.replace(/^https?:\/\/[^/]+\//, "")}</span>
              <button
                onClick={() => { setShowRepoForm(true); setRepoUrl(orr.repositoryPath || ""); }}
                className="ml-1 text-[10px] text-gray-400 hover:text-blue-600"
                title="Update repository URL or token"
              >
                edit
              </button>
            </div>
          ) : (
            <div className="mt-1.5">
              {showRepoForm ? (
                <div className="space-y-1.5">
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/org/repo"
                    className="w-full px-1.5 py-1 border border-gray-300 rounded text-[10px] font-mono"
                  />
                  {repoUrl.trim() && (
                    <input
                      type="password"
                      value={repoToken}
                      onChange={(e) => setRepoToken(e.target.value)}
                      placeholder="Token (for private repos)"
                      className="w-full px-1.5 py-1 border border-gray-300 rounded text-[10px] font-mono"
                    />
                  )}
                  {repoError && <div className="text-[10px] text-red-600">{repoError}</div>}
                  <div className="flex gap-1">
                    <button
                      onClick={handleRepoSubmit}
                      disabled={repoSaving || !repoUrl.trim()}
                      className="flex-1 py-0.5 bg-blue-600 text-white rounded text-[10px] disabled:opacity-50"
                    >
                      {repoSaving ? "Cloning..." : "Connect"}
                    </button>
                    <button
                      onClick={() => { setShowRepoForm(false); setRepoError(""); }}
                      className="px-2 py-0.5 text-gray-500 rounded text-[10px] hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowRepoForm(true)}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  + Connect repo
                </button>
              )}
            </div>
          )}

          {/* Coverage map */}
          <div className="mt-2 flex gap-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                title={`${s.title}: ${DEPTH_LABELS[s.depth]}`}
                className={`flex-1 h-2 rounded-sm ${DEPTH_COLORS[s.depth]} ${
                  s.id === activeSection ? "ring-2 ring-blue-500" : ""
                }`}
              />
            ))}
          </div>

          {/* Terminate button — only for non-terminal statuses */}
          {(orr.status === "DRAFT" || orr.status === "IN_PROGRESS") && (
            <button
              onClick={async () => {
                const reason = window.prompt("Why are you terminating this ORR? (required)");
                if (!reason?.trim()) return;
                try {
                  const res = await api.orrs.terminate(id!, reason.trim());
                  setOrr(res.orr);
                } catch (err: any) {
                  alert(err.message || "Failed to terminate ORR");
                }
              }}
              className="mt-2 w-full text-[10px] px-1.5 py-1 text-red-600 hover:bg-red-50 border border-red-200 rounded transition-colors"
            >
              Terminate ORR
            </button>
          )}
        </div>

        {/* Section list */}
        <div className="overflow-y-auto flex-1 py-1">
          {sections.map((s) => {
            const answered = answeredCount(s);
            const total = totalQuestions(s);
            const codeSourcing = codeSourcedCount(s);
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full text-left px-3 py-2 text-xs ${
                  s.id === activeSection
                    ? "bg-blue-50 border-r-2 border-blue-500"
                    : "hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DEPTH_COLORS[s.depth]}`} />
                  <span className="flex-1 truncate text-gray-700">
                    {s.position}. {s.title}
                  </span>
                  {orr.orrType === "feature" && parentOrr && s.title === "Impact on Existing Service" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" title="Checks impact on parent service ORR" />
                  )}
                </div>
                <div className="ml-3.5 mt-0.5 text-[10px] text-gray-400">
                  {answered}/{total} answered
                  {codeSourcing > 0 && (
                    <span className="ml-1 text-purple-500" title={`${codeSourcing} answer${codeSourcing > 1 ? "s" : ""} sourced from code`}>
                      ({codeSourcing} from code)
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Child Feature ORRs (for service ORRs) */}
        {childOrrs.length > 0 && (
          <div className="border-t border-gray-200 p-3">
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Feature ORRs</div>
            <div className="space-y-1">
              {childOrrs.map((child: any) => {
                const types = typeof child.changeTypes === "string" ? JSON.parse(child.changeTypes) : (child.changeTypes || []);
                return (
                  <Link
                    key={child.id}
                    to={`/orrs/${child.id}`}
                    className="block px-2 py-1.5 rounded hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                      <span className="text-xs text-gray-700 truncate">
                        {child.changeDescription
                          ? child.changeDescription.length > 40
                            ? child.changeDescription.slice(0, 40) + "..."
                            : child.changeDescription
                          : "Feature review"}
                      </span>
                    </div>
                    <div className="ml-3 mt-0.5 flex flex-wrap gap-0.5">
                      {types.slice(0, 3).map((ct: string) => (
                        <span key={ct} className="px-1 py-0 rounded bg-purple-50 text-purple-500 text-[8px]">
                          {ct.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending update suggestions from feature ORRs (for service ORRs) */}
        {pendingSuggestions.length > 0 && (
          <div className="border-t border-gray-200 p-3">
            <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wide mb-1.5">
              Pending Updates ({pendingSuggestions.length})
            </div>
            <div className="space-y-2">
              {pendingSuggestions.map((s: any) => (
                <div key={s.id} className="rounded border border-amber-200 bg-amber-50 p-2">
                  <p className="text-xs text-gray-700">{s.suggestion}</p>
                  <p className="text-[10px] text-gray-500 mt-1 italic">{s.rationale}</p>
                  <div className="flex gap-1 mt-1.5">
                    <button
                      onClick={async () => {
                        await api.orrs.updateSuggestion(id!, s.id, "accepted");
                        setPendingSuggestions((prev) => prev.filter((p) => p.id !== s.id));
                      }}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100"
                    >
                      Accept
                    </button>
                    <button
                      onClick={async () => {
                        await api.orrs.updateSuggestion(id!, s.id, "dismissed");
                        setPendingSuggestions((prev) => prev.filter((p) => p.id !== s.id));
                      }}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Column 2: Tabbed workspace */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Tab bar */}
        <div className="flex items-center border-b border-gray-200 bg-white px-1">
          <div className="flex">
            {(["review", "risks", "experiments", "dependencies", "learning"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1 pr-2">
            <a
              href={`/api/v1/orrs/${id}/export/markdown`}
              className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Export ORR document as Markdown"
            >
              Export Doc
            </a>
            <a
              href={`/api/v1/orrs/${id}/export/conversation`}
              className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Export conversation transcript"
            >
              Export Chat
            </a>
          </div>
        </div>

        {activeTab === "learning" ? (
          <LearningPanel practiceType="orr" practiceId={id!} refreshKey={learningRefreshKey} />
        ) : activeTab === "dependencies" ? (
          <DependenciesPanel orrId={id!} serviceName={orr.serviceName} sections={sections} />
        ) : activeTab === "experiments" ? (
          <ExperimentsPanel practiceType="orr" practiceId={id!} />
        ) : activeTab === "risks" ? (
          <RisksPanel orrId={id!} sections={sections} onNavigateToSection={(sectionId) => { setActiveSection(sectionId); setActiveTab("review"); }} onReload={reloadData} />
        ) : currentSection ? (
          <>
            {/* Section header */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-900">{currentSection.title}</h3>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className={`inline-block w-2 h-2 rounded-full ${DEPTH_COLORS[currentSection.depth]}`} />
                  <span>{DEPTH_LABELS[currentSection.depth]}</span>
                </div>
                {session.saving && <span className="text-[10px] text-gray-400 ml-auto">Saving...</span>}
              </div>
              {currentSection.depthRationale && (
                <p className="text-xs text-gray-400 mt-1 italic">{currentSection.depthRationale}</p>
              )}
            </div>

            {/* Questions list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Parent context panel (feature ORRs only) */}
              {orr.orrType === "feature" && parentOrr && parentOrr.sections?.some((s: any) => s.hasContent) && (
                <ParentContextPanel parentOrr={parentOrr} />
              )}

              {currentPrompts.map((prompt: string, i: number) => {
                const isEditing = session.editingResponses[i] !== undefined;
                const rawValue = savedResponses[i];
                const savedValue = getResponseText(rawValue);
                const source = getResponseSource(rawValue);
                const codeRef = getResponseCodeRef(rawValue);
                const responseValue = isEditing ? session.editingResponses[i] : savedValue;
                const isAnswered = (savedValue || session.editingResponses[i] || "").trim().length > 0;

                return (
                  <div key={i} id={`question-${i}`} className="group scroll-mt-4">
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                        isAnswered ? "bg-green-500" : "bg-gray-300"
                      }`} />
                      <span className="text-xs font-mono text-gray-400 mt-0.5 flex-shrink-0">Q{i + 1}</span>
                      <span className="text-sm text-gray-700 font-medium">{prompt}</span>
                    </div>
                    <div className="ml-4">
                      {isEditing ? (
                        <textarea
                          autoFocus
                          value={responseValue}
                          onChange={(e) => session.handleResponseChange(i, e.target.value)}
                          onBlur={() => {
                            session.flushPendingEdits();
                            session.setEditingResponses((prev) => {
                              const next = { ...prev };
                              delete next[i];
                              return next;
                            });
                          }}
                          placeholder="Type your answer here..."
                          className="w-full bg-white rounded border border-blue-300 p-2.5 text-sm text-gray-700 ring-1 ring-blue-500 resize-y transition-colors"
                          rows={responseValue ? Math.max(3, responseValue.split("\n").length + 1) : 3}
                        />
                      ) : savedValue ? (
                        <div
                          onClick={isReadOnly ? undefined : () => session.setEditingResponses((prev) => ({ ...prev, [i]: savedValue }))}
                          className={`w-full bg-gray-50 rounded border border-gray-200 p-2.5 text-sm text-gray-700 ${isReadOnly ? "" : "cursor-text hover:border-gray-300 hover:bg-gray-100"} transition-colors`}
                        >
                          {renderMarkdown(savedValue)}
                          {source === "code" && (
                            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-purple-600">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                <path fillRule="evenodd" d="M4.78 4.97a.75.75 0 0 1 0 1.06L2.81 8l1.97 1.97a.75.75 0 1 1-1.06 1.06l-2.5-2.5a.75.75 0 0 1 0-1.06l2.5-2.5a.75.75 0 0 1 1.06 0Zm6.44 0a.75.75 0 0 1 1.06 0l2.5 2.5a.75.75 0 0 1 0 1.06l-2.5 2.5a.75.75 0 1 1-1.06-1.06L13.19 8l-1.97-1.97a.75.75 0 0 1 0-1.06Zm-3.4-.89a.75.75 0 0 1 .46.95l-2 6a.75.75 0 0 1-1.41-.47l2-6a.75.75 0 0 1 .95-.48Z" clipRule="evenodd" />
                              </svg>
                              <span>sourced from code</span>
                              {codeRef && <span className="text-purple-400 font-mono">{codeRef}</span>}
                            </div>
                          )}
                        </div>
                      ) : !isReadOnly ? (
                        <div
                          onClick={() => session.setEditingResponses((prev) => ({ ...prev, [i]: "" }))}
                          className="w-full bg-gray-50 rounded border border-gray-200 border-dashed p-2.5 text-sm text-gray-400 cursor-text hover:border-gray-300 transition-colors"
                        >
                          Click to answer, or let the AI capture your response during the review...
                        </div>
                      ) : (
                        <div className="w-full bg-gray-50 rounded border border-gray-200 border-dashed p-2.5 text-sm text-gray-400">
                          Not answered
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* AI Observations */}
              {currentSection.content && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">AI Observations</div>
                  <div className="bg-blue-50 rounded border border-blue-100 p-3 text-sm text-gray-700 leading-relaxed">
                    {renderMarkdown(currentSection.content)}
                  </div>
                </div>
              )}

              {/* Flags */}
              {currentFlags.length > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Flags</div>
                  <div className="space-y-2">
                    {currentFlags.map((f: any, i: number) => {
                      const isRisk = f.type === "RISK";
                      const status = f.status || "OPEN";
                      const isResolved = status === "RESOLVED" || status === "ACCEPTED";
                      const isOverdue = isRisk && f.deadline && new Date(f.deadline) < new Date() && !isResolved;
                      return (
                        <div
                          key={i}
                          className={`rounded border px-3 py-2 text-xs ${
                            isResolved
                              ? "border-gray-200 bg-gray-50 opacity-60"
                              : isRisk
                                ? "border-red-200 bg-red-50"
                                : "border-gray-200 bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${FLAG_COLORS[f.type] || "bg-gray-100 text-gray-600"}`}>
                              {f.type}
                            </span>
                            {isRisk && f.severity && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SEVERITY_COLORS_BOLD[f.severity] || "bg-gray-200"}`}>
                                {f.severity}
                              </span>
                            )}
                            {status !== "OPEN" && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                status === "ACCEPTED" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"
                              }`}>
                                {status}
                              </span>
                            )}
                            {isRisk && f.deadline && (
                              <span className={`text-[10px] ${isOverdue ? "text-red-600 font-bold" : "text-gray-500"}`}>
                                {isOverdue ? "OVERDUE" : "Due"}: {f.deadline}
                              </span>
                            )}
                            <span className="ml-auto flex gap-1">
                              {status === "OPEN" ? (
                                <>
                                  <button
                                    onClick={async () => {
                                      const reason = prompt(f.type === "RISK" ? "Why is this risk acceptable?" : "Why accept this?");
                                      if (reason) {
                                        await api.flags.updateStatus(id!, activeSection!, i, { status: "ACCEPTED", resolution: reason });
                                        reloadData();
                                      }
                                    }}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 hover:bg-purple-100"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    onClick={async () => {
                                      const reason = prompt("What was done to resolve this?");
                                      if (reason) {
                                        await api.flags.updateStatus(id!, activeSection!, i, { status: "RESOLVED", resolution: reason });
                                        reloadData();
                                      }
                                    }}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100"
                                  >
                                    Resolve
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={async () => {
                                    await api.flags.updateStatus(id!, activeSection!, i, { status: "OPEN" });
                                    reloadData();
                                  }}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                                >
                                  Reopen
                                </button>
                              )}
                            </span>
                          </div>
                          <div className="mt-1 text-gray-700">{f.note}</div>
                          {f.resolution && (
                            <div className="mt-1 text-gray-500 italic">
                              {status === "ACCEPTED" ? "Accepted" : "Resolved"}: {f.resolution}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a section to begin
          </div>
        )}
      </div>

      <ConversationPanel
        sessionId={session.sessionId}
        sessionTokens={session.sessionTokens}
        streaming={session.streaming}
        messages={session.messages}
        messagesEndRef={session.messagesEndRef}
        notification={session.notification}
        setNotification={session.setNotification}
        streamStatus={session.streamStatus}
        thinkingStatus={session.thinkingStatus}
        lastError={session.lastError}
        setLastError={session.setLastError}
        handleRetry={session.handleRetry}
        startSession={startSession}
        endSession={endSession}
        input={session.input}
        handleInputChange={session.handleInputChange}
        handleInputKeyDown={session.handleInputKeyDown}
        handleSend={session.handleSend}
        inputRef={session.inputRef}
        showSlashMenu={session.showSlashMenu}
        setShowSlashMenu={session.setShowSlashMenu}
        filteredSlashCommands={session.filteredSlashCommands}
        slashSelectedIndex={session.slashSelectedIndex}
        setSlashSelectedIndex={session.setSlashSelectedIndex}
        handleSlashSelect={session.handleSlashSelect}
        speech={session.speech}
        discussingTitle={activeSection && currentSection ? currentSection.title : null}
        emptyStateText="Start an AI session to get help reviewing this ORR."
        emptyStateSubtext="The AI will help you think through questions, share relevant lessons, and assess depth."
        renderMarkdown={renderMarkdown}
        isReadOnly={isReadOnly}
        readOnlyReason={orr.status === "TERMINATED" ? "terminated" : orr.status === "ARCHIVED" ? "archived" : undefined}
      />
    </div>
  );
}
