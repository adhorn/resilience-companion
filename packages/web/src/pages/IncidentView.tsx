import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { ConversationPanel } from "../components/ConversationPanel";
import { ExperimentsPanel } from "../components/ExperimentsPanel";
import { LearningPanel } from "../components/LearningPanel";
import { DEPTH_COLORS, DEPTH_LABELS, SEVERITY_COLORS_BOLD, FACTOR_CATEGORY_COLORS, EVENT_TYPE_COLORS } from "../lib/style-constants";
import { renderMarkdown } from "../lib/markdown";
import { parseResponses, getResponseText, answeredCount, totalQuestions } from "../lib/responses";
import { useReviewSession, SlashCommand } from "../hooks/useReviewSession";

type WorkspaceTab = "analysis" | "timeline" | "factors" | "actions" | "experiments" | "learning";

const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "timeline",
    description: "Build out the incident timeline",
    prompt: "Based on what we've discussed so far, help me build the incident timeline. IMMEDIATELY call record_timeline_event for each event — do not just describe them in text. Include timestamps, descriptions, and who was involved. Then ask me about any gaps.",
  },
  {
    name: "factors",
    description: "Identify contributing factors",
    prompt: "Let's identify the contributing factors for this incident. Based on our discussion, IMMEDIATELY call record_contributing_factor for each factor — do not just describe them in text. Consider technical, process, organizational, human, and communication categories. For each, assess whether it's systemic.",
  },
  {
    name: "actions",
    description: "Generate action items from our analysis",
    prompt: "Based on the contributing factors and our discussion, IMMEDIATELY call record_action_item for each action item — do not just describe them in text. Focus on systemic improvements, not individual blame. Each action must link to a contributing_factor_id and have clear success criteria, a priority, and a type (technical, process, organizational, or learning).",
  },
  {
    name: "summarize",
    description: "Summarize the analysis so far",
    prompt: "Summarize our incident analysis progress. Cover: what happened (timeline), why it happened (contributing factors), what we've learned, and what actions are pending. Highlight any gaps in our understanding.",
  },
  {
    name: "depth",
    description: "Assess depth of the current section",
    prompt: "Based on our conversation about this section, assess its depth. Are we still at the surface level (what happened), or have we explored contributing factors (moderate) and systemic patterns (deep)? What would help us go deeper?",
  },
  {
    name: "patterns",
    description: "Look for systemic patterns",
    prompt: "Search for teaching moments and case studies that match the patterns we've seen in this incident. Use query_teaching_moments and query_case_studies to find matches. What systemic patterns connect this incident to broader organizational dynamics?",
  },
  {
    name: "experiments",
    description: "Suggest experiments to validate fixes or prevent recurrence",
    prompt: "Review the contributing factors and fixes we've discussed. For your top 2-3 recommendations, IMMEDIATELY call the suggest_experiment tool for each one — do not just describe them in text. Each experiment needs a type (chaos_experiment, load_test, or gameday), a clear hypothesis, rationale, and priority. Weight recurrence likelihood heavily.",
  },
  {
    name: "learning",
    description: "Extract learning signals from all sections",
    prompt: "Review all sections for learning signals using the section summaries already in your context — DO NOT call read_section, you already have depth rationales, flags, code-sourced answer counts, and question stats for every section. For each surprise, mental model change, WAI-WAD gap, or blind spot you find, IMMEDIATELY call record_discovery with source='learning_command' — do not just describe them in text. Batch as many record_discovery calls as possible into each response. Include the section_id when the discovery relates to a specific section, omit it when it spans sections. IMPORTANT: Always pass source='learning_command' in every record_discovery call. Also consider contributing factors and escalation paths. Aim for specificity: not 'learned about incident response' but 'discovered that the escalation path had a 45-minute gap because the on-call rotation had no backup for the database team'. After recording all discoveries, summarize what you found.",
  },
];

export function IncidentView() {
  const { id } = useParams<{ id: string }>();
  const [incident, setIncident] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [contributingFactors, setContributingFactors] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("analysis");

  const reloadData = useCallback(async () => {
    if (!id) return;
    const res = await api.incidents.get(id);
    setIncident(res.incident);
    setSections(res.sections.sort((a: any, b: any) => a.position - b.position));
    setTimelineEvents(res.timelineEvents || []);
    setContributingFactors(res.contributingFactors || []);
    setActionItems(res.actionItems || []);
  }, [id]);

  const saveResponses = useCallback(
    async (sectionId: string, responses: Record<number, string>) => {
      if (!id) return;
      await api.incidentSections.update(id, sectionId, { promptResponses: responses });
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, promptResponses: responses } : s)),
      );
    },
    [id],
  );

  const session = useReviewSession({
    practiceId: id,
    buildMessageUrl: (practiceId, sessionId) =>
      `/api/v1/incidents/${practiceId}/sessions/${sessionId}/messages`,
    reloadData,
    activeSection,
    setActiveSection,
    slashCommands: SLASH_COMMANDS,
    sections,
    saveResponses,
    renewalMessage: "Session renewed (token limit reached). Your analysis continues seamlessly.",
  });

  // Load incident + restore active session
  useEffect(() => {
    if (!id) return;

    async function loadIncident() {
      try {
        const res = await api.incidents.get(id!);
        setIncident(res.incident);
        const sorted = res.sections.sort((a: any, b: any) => a.position - b.position);
        setSections(sorted);
        setTimelineEvents(res.timelineEvents || []);
        setContributingFactors(res.contributingFactors || []);
        setActionItems(res.actionItems || []);
        if (sorted.length > 0) setActiveSection(sorted[0].id);

        // Restore or auto-create session
        const sessRes = await api.incidentSessions.list(id!);
        const activeSession = sessRes.sessions.find((s: any) => s.status === "ACTIVE");
        if (activeSession) {
          session.setSessionId(activeSession.id);
          session.setSessionTokens(activeSession.tokenUsage || 0);
        } else {
          try {
            const newSess = await api.incidentSessions.create(id!);
            session.setSessionId(newSess.session.id);
            session.setSessionTokens(0);
          } catch (err) {
            console.error("Failed to auto-create session:", err);
          }
        }

        // Load all messages
        const msgRes = await api.incidentSessions.getAllMessages(id!);
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

    loadIncident();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startSession = useCallback(async () => {
    if (!id) return;
    const res = await api.incidentSessions.create(id);
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
    await api.incidentSessions.end(id, session.sessionId);
    session.setSessionId(null);
    await reloadData();
  }, [id, session, reloadData]);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!incident) return <div className="p-6 text-red-500">Incident not found</div>;

  const currentSection = sections.find((s) => s.id === activeSection);
  const currentPrompts = currentSection
    ? typeof currentSection.prompts === "string"
      ? JSON.parse(currentSection.prompts)
      : currentSection.prompts
    : [];
  const savedResponses = parseResponses(currentSection);

  return (
    <div className="flex h-screen">
      {/* Column 1: Section sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50 overflow-hidden">
        <div className="p-3 border-b border-gray-200">
          <Link to="/incidents" className="text-[10px] text-gray-400 hover:text-blue-600">&larr; All Incidents</Link>
          <h2 className="font-bold text-sm text-gray-900 truncate mt-1">{incident.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-gray-500">{incident.status.replace(/_/g, " ")}</span>
            {incident.severity && (
              <span className={`px-1 py-0 rounded text-[10px] font-medium ${SEVERITY_COLORS_BOLD[incident.severity] || ""}`}>
                {incident.severity}
              </span>
            )}
          </div>
          {incident.serviceName && (
            <div className="text-[10px] text-gray-500 mt-0.5">{incident.serviceName}</div>
          )}

          {/* Steering tier */}
          <select
            value={incident.steeringTier || "thorough"}
            onChange={async (e) => {
              const tier = e.target.value;
              setIncident({ ...incident, steeringTier: tier });
              await api.incidents.update(id!, { steeringTier: tier });
            }}
            className="mt-1.5 w-full text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-white text-gray-700"
            title="Agent steering rigor"
          >
            <option value="standard">Standard</option>
            <option value="thorough">Thorough (default)</option>
            <option value="rigorous">Rigorous</option>
          </select>

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

          {/* Structured data counts */}
          <div className="mt-2 flex gap-2 text-[10px] text-gray-500">
            <span title="Timeline events">{timelineEvents.length} events</span>
            <span title="Contributing factors">{contributingFactors.length} factors</span>
            <span title="Action items">{actionItems.length} actions</span>
          </div>
        </div>

        {/* Section list */}
        <div className="overflow-y-auto flex-1 py-1">
          {sections.map((s) => {
            const answered = answeredCount(s);
            const total = totalQuestions(s);
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
            {(["analysis", "timeline", "factors", "actions", "experiments", "learning"] as const).map((tab) => (
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
                {tab === "timeline" && timelineEvents.length > 0 && (
                  <span className="ml-1 text-xs text-gray-400">({timelineEvents.length})</span>
                )}
                {tab === "factors" && contributingFactors.length > 0 && (
                  <span className="ml-1 text-xs text-gray-400">({contributingFactors.length})</span>
                )}
                {tab === "actions" && actionItems.length > 0 && (
                  <span className="ml-1 text-xs text-gray-400">({actionItems.length})</span>
                )}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1 pr-2">
            <a
              href={`/api/v1/incidents/${id}/export/markdown`}
              className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Export incident analysis as Markdown"
            >
              Export Doc
            </a>
            <a
              href={`/api/v1/incidents/${id}/export/conversation`}
              className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Export conversation transcript"
            >
              Export Chat
            </a>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "analysis" && currentSection && (
            <div>
              {/* Section header */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">{currentSection.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    currentSection.depth === "DEEP" ? "bg-green-100 text-green-700" :
                    currentSection.depth === "MODERATE" ? "bg-orange-100 text-orange-700" :
                    currentSection.depth === "SURFACE" ? "bg-yellow-100 text-yellow-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {DEPTH_LABELS[currentSection.depth]}
                  </span>
                  {currentSection.depthRationale && (
                    <span className="text-xs text-gray-500 italic">{currentSection.depthRationale}</span>
                  )}
                </div>
              </div>

              {/* Questions */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-400">Click any answer to edit</span>
                {session.saving && <span className="text-[10px] text-gray-400 ml-auto">Saving...</span>}
              </div>
              <div className="space-y-4">
                {currentPrompts.map((prompt: string, i: number) => {
                  const isEditing = session.editingResponses[i] !== undefined;
                  const savedValue = getResponseText(savedResponses[i]);
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
                          </div>
                        ) : (
                          <div
                            onClick={() => session.setEditingResponses((prev) => ({ ...prev, [i]: "" }))}
                            className="w-full bg-gray-50 rounded border border-dashed border-gray-300 p-2.5 text-sm text-gray-400 cursor-text hover:border-gray-400 hover:bg-gray-100 transition-colors"
                          >
                            Click to answer...
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AI observations */}
              {currentSection.content && currentSection.content.trim() && (
                <div className="mt-6 bg-blue-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">AI Observations</h4>
                  <div className="text-sm text-blue-800">
                    {renderMarkdown(currentSection.content)}
                  </div>
                </div>
              )}

              {/* Flags */}
              {(() => {
                const flags = currentSection.flags
                  ? typeof currentSection.flags === "string"
                    ? JSON.parse(currentSection.flags) : currentSection.flags
                  : [];
                if (flags.length === 0) return null;
                return (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Flags</h4>
                    <div className="space-y-2">
                      {flags.map((flag: any, i: number) => (
                        <div key={i} className={`p-2 rounded border text-sm ${
                          flag.status === "RESOLVED" || flag.status === "ACCEPTED"
                            ? "opacity-50" : ""
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              flag.type === "RISK" ? "bg-red-100 text-red-700" :
                              flag.type === "GAP" ? "bg-amber-100 text-amber-700" :
                              flag.type === "STRENGTH" ? "bg-green-100 text-green-700" :
                              "bg-blue-100 text-blue-700"
                            }`}>{flag.type}</span>
                            {flag.severity && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SEVERITY_COLORS_BOLD[flag.severity] || ""}`}>
                                {flag.severity}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400">{flag.status}</span>
                          </div>
                          <p className="mt-1 text-gray-700">{flag.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === "timeline" && (
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Timeline</h3>
              {timelineEvents.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-50 rounded p-4">
                  No timeline events yet. Use the AI conversation to build the timeline — try the <code className="bg-gray-200 px-1 rounded">/timeline</code> command.
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                  <div className="space-y-4">
                    {timelineEvents.sort((a, b) => a.position - b.position).map((evt) => (
                      <div key={evt.id} className="relative pl-10">
                        <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-white border-2 border-blue-500" />
                        <div className="bg-white border rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-gray-500">
                              {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : "Unknown time"}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${EVENT_TYPE_COLORS[evt.eventType] || EVENT_TYPE_COLORS.other}`}>
                              {evt.eventType.replace(/_/g, " ")}
                            </span>
                            {evt.actor && (
                              <span className="text-[10px] text-gray-400">by {evt.actor}</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-800">{evt.description}</p>
                          {evt.evidence && (
                            <p className="text-xs text-gray-500 mt-1 italic">{evt.evidence}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "factors" && (
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Contributing Factors</h3>
              {contributingFactors.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-50 rounded p-4">
                  No contributing factors yet. Use the AI conversation to identify factors — try the <code className="bg-gray-200 px-1 rounded">/factors</code> command.
                </div>
              ) : (
                <div className="space-y-3">
                  {contributingFactors.map((factor) => (
                    <div key={factor.id} className="bg-white border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${FACTOR_CATEGORY_COLORS[factor.category] || "bg-gray-100 text-gray-700"}`}>
                          {factor.category.replace(/_/g, " ")}
                        </span>
                        {factor.isSystemic && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">
                            systemic
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800">{factor.description}</p>
                      {factor.context && (
                        <p className="text-xs text-gray-500 mt-1">{factor.context}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "actions" && (
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Action Items</h3>
              {actionItems.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-50 rounded p-4">
                  No action items yet. Use the AI conversation to generate actions — try the <code className="bg-gray-200 px-1 rounded">/actions</code> command.
                </div>
              ) : (
                <div className="space-y-3">
                  {actionItems.map((item) => (
                    <div key={item.id} className="bg-white border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            item.priority === "high" ? "bg-red-100 text-red-700" :
                            item.priority === "medium" ? "bg-orange-100 text-orange-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>{item.priority}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                            {item.type}
                          </span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          item.status === "done" ? "bg-green-100 text-green-700" :
                          item.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>{item.status.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      {item.owner && <p className="text-xs text-gray-500 mt-0.5">Owner: {item.owner}</p>}
                      {item.successCriteria && <p className="text-xs text-gray-500 mt-0.5">Success: {item.successCriteria}</p>}
                      {item.dueDate && <p className="text-xs text-gray-400 mt-0.5">Due: {new Date(item.dueDate).toLocaleDateString()}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "experiments" && (
            <ExperimentsPanel practiceType="incident" practiceId={id!} />
          )}

          {activeTab === "learning" && (
            <LearningPanel practiceType="incident" practiceId={id!} />
          )}
        </div>
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
        emptyStateText="Start an AI session to get help analyzing this incident."
        emptyStateSubtext="The AI will help you explore contributing factors, build timelines, and extract systemic learning."
        renderMarkdown={renderMarkdown}
        isReadOnly={incident?.status === "ARCHIVED"}
        readOnlyReason="archived"
      />
    </div>
  );
}
