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
    prompt: "Review everything we've discussed so far across all sections. Identify every service, database, API, queue, cache, or infrastructure component that was mentioned as a dependency — and call record_dependency for each one you haven't already recorded. Give me a summary of what you found.",
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
    prompt: "Review all sections we've discussed so far. For the highest-ROI experiments, IMMEDIATELY call suggest_experiment for each one — do not just describe them in text. Each needs a type (chaos_experiment, load_test, or gameday), a clear hypothesis, rationale, and priority. Prioritize by blast radius and confidence gaps. Aim for 2-3 experiments.",
  },
  {
    name: "learning",
    description: "Extract learning signals from all sections",
    prompt: "Review all sections for learning signals using the section summaries already in your context — DO NOT call read_section, you already have depth rationales, flags, code-sourced answer counts, and question stats for every section. For each surprise, mental model change, WAI-WAD gap, or blind spot you find, IMMEDIATELY call record_discovery with source='learning_command' — do not just describe them in text. Batch as many record_discovery calls as possible into each response. Include the section_id when the discovery relates to a specific section, omit it when it spans sections. IMPORTANT: Always pass source='learning_command' in every record_discovery call. Aim for specificity: not 'learned about architecture' but 'discovered retry logic has no jitter, risking thundering herd at scale'. After recording all discoveries, summarize what you found.",
  },
];

export function ORRView() {
  const { id } = useParams<{ id: string }>();
  const [orr, setOrr] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("review");

  // Repo connection
  const [showRepoForm, setShowRepoForm] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoToken, setRepoToken] = useState("");
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoError, setRepoError] = useState("");

  const reloadData = useCallback(async () => {
    if (!id) return;
    const res = await api.orrs.get(id);
    setOrr(res.orr);
    setSections(res.sections.sort((a: any, b: any) => a.position - b.position));
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
        const orrRes = await api.orrs.get(id!);
        setOrr(orrRes.orr);
        const sorted = orrRes.sections.sort((a: any, b: any) => a.position - b.position);
        setSections(sorted);
        if (sorted.length > 0) setActiveSection(sorted[0].id);

        const sessRes = await api.sessions.list(id!);
        const activeSession = sessRes.sessions.find((s: any) => s.status === "ACTIVE");
        if (activeSession) {
          session.setSessionId(activeSession.id);
          session.setSessionTokens(activeSession.tokenUsage || 0);
        }

        const msgRes = await api.sessions.getAllMessages(id!);
        if (msgRes.messages.length > 0) {
          session.setMessages(
            msgRes.messages.map((m: any) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
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
    session.setMessages([]);
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

  return (
    <div className="flex h-screen">
      {/* Column 1: Section sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50 overflow-hidden">
        <div className="p-3 border-b border-gray-200">
          <Link to="/orrs" className="text-[10px] text-gray-400 hover:text-blue-600">&larr; All ORRs</Link>
          <h2 className="font-bold text-sm text-gray-900 truncate mt-1">{orr.serviceName}</h2>
          <div className="text-[10px] text-gray-500 mt-1">{orr.status.replace("_", " ")}</div>

          {/* Steering tier */}
          <select
            value={orr.steeringTier || "thorough"}
            onChange={async (e) => {
              const tier = e.target.value;
              setOrr({ ...orr, steeringTier: tier });
              await api.orrs.update(id!, { steeringTier: tier });
            }}
            className="mt-1.5 w-full text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-white text-gray-700"
            title="Agent steering rigor — controls how strictly the AI follows review workflow rules"
          >
            <option value="standard">Standard — fast, fewer checks</option>
            <option value="thorough">Thorough — balanced (default)</option>
            <option value="rigorous">Rigorous — strict validation</option>
          </select>

          {/* Repo connection */}
          {orr.repositoryPath ? (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-green-600" title={orr.repositoryPath}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
              <span className="truncate">{orr.repositoryPath.replace(/^https?:\/\/[^/]+\//, "")}</span>
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
          <LearningPanel practiceType="orr" practiceId={id!} />
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
              {currentPrompts.map((prompt: string, i: number) => {
                const isEditing = session.editingResponses[i] !== undefined;
                const rawValue = savedResponses[i];
                const savedValue = getResponseText(rawValue);
                const source = getResponseSource(rawValue);
                const codeRef = getResponseCodeRef(rawValue);
                const responseValue = isEditing ? session.editingResponses[i] : savedValue;
                const isAnswered = (savedValue || session.editingResponses[i] || "").trim().length > 0;

                return (
                  <div key={i} className="group">
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                        isAnswered ? "bg-green-500" : "bg-gray-300"
                      }`} />
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
                          onClick={() => session.setEditingResponses((prev) => ({ ...prev, [i]: savedValue }))}
                          className="w-full bg-gray-50 rounded border border-gray-200 p-2.5 text-sm text-gray-700 cursor-text hover:border-gray-300 hover:bg-gray-100 transition-colors"
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
                      ) : (
                        <div
                          onClick={() => session.setEditingResponses((prev) => ({ ...prev, [i]: "" }))}
                          className="w-full bg-gray-50 rounded border border-gray-200 border-dashed p-2.5 text-sm text-gray-400 cursor-text hover:border-gray-300 transition-colors"
                        >
                          Click to answer, or let the AI capture your response during the review...
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
      />
    </div>
  );
}
