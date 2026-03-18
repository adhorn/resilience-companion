import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, sendMessage } from "../api/client";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { TracesPanel } from "../components/TracesPanel";
import { DependenciesPanel } from "../components/DependenciesPanel";

type WorkspaceTab = "review" | "traces" | "dependencies";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SlashCommand {
  name: string;
  description: string;
  prompt: string;
}

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
];

const DEPTH_COLORS: Record<string, string> = {
  UNKNOWN: "bg-gray-200",
  SURFACE: "bg-yellow-400",
  MODERATE: "bg-orange-400",
  DEEP: "bg-green-500",
};

const DEPTH_LABELS: Record<string, string> = {
  UNKNOWN: "Not reviewed",
  SURFACE: "Surface",
  MODERATE: "Moderate",
  DEEP: "Deep",
};

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

/**
 * Render markdown-ish text to React elements.
 * Handles: **bold**, *italic*, `code`, bullet lists, numbered lists, paragraphs.
 */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  function flushList() {
    if (listItems.length === 0) return;
    const items = listItems.map((item, i) => (
      <li key={i}>{renderInline(item)}</li>
    ));
    if (listType === "ol") {
      elements.push(<ol key={key++} className="list-decimal list-inside space-y-1 my-1">{items}</ol>);
    } else {
      elements.push(<ul key={key++} className="list-disc list-inside space-y-1 my-1">{items}</ul>);
    }
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Bullet list
    if (/^[-•]\s/.test(trimmed)) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(trimmed.replace(/^[-•]\s+/, ""));
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(trimmed)) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(trimmed.replace(/^\d+[.)]\s+/, ""));
      continue;
    }

    flushList();

    if (trimmed === "") {
      elements.push(<div key={key++} className="h-3" />);
    } else {
      elements.push(<p key={key++} className="mb-2 last:mb-0">{renderInline(trimmed)}</p>);
    }
  }
  flushList();

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="font-semibold">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++}>{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }

    // Code
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(<code key={key++} className="px-1 py-0.5 bg-gray-200 rounded text-xs font-mono">{codeMatch[2]}</code>);
      remaining = codeMatch[3];
      continue;
    }

    // No more patterns
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return <>{parts}</>;
}

export function ORRView() {
  const { id } = useParams<{ id: string }>();
  const [orr, setOrr] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string | null>(null); // retry/status messages during streaming
  const [lastError, setLastError] = useState<string | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);
  const speech = useSpeechRecognition((text) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  });
  // Slash commands
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Repo connection
  const [showRepoForm, setShowRepoForm] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("review");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoToken, setRepoToken] = useState("");
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoError, setRepoError] = useState("");
  // Per-question responses: local editing state
  const [editingResponses, setEditingResponses] = useState<Record<number, string>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Debounce reloadSections to avoid race conditions from rapid section_updated events
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadSeqRef = useRef(0);

  // Load ORR + restore active session
  useEffect(() => {
    if (!id) return;

    async function loadORR() {
      try {
        const orrRes = await api.orrs.get(id!);
        setOrr(orrRes.orr);
        const sorted = orrRes.sections.sort((a: any, b: any) => a.position - b.position);
        setSections(sorted);
        if (sorted.length > 0) {
          setActiveSection(sorted[0].id);
        }

        // Check for existing active session and restore it
        const sessRes = await api.sessions.list(id!);
        const activeSession = sessRes.sessions.find((s: any) => s.status === "ACTIVE");
        if (activeSession) {
          setSessionId(activeSession.id);
          setSessionTokens(activeSession.tokenUsage || 0);
        }

        // Load ALL messages across all sessions for this ORR
        // (preserves full conversation history across session renewals)
        const msgRes = await api.sessions.getAllMessages(id!);
        if (msgRes.messages.length > 0) {
          setMessages(
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
  }, [id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Helper to reload sections from server, with sequence number to prevent stale overwrites
  const reloadSections = useCallback(async () => {
    if (!id) return;
    const seq = ++reloadSeqRef.current;
    const res = await api.orrs.get(id);
    // Only apply if this is still the latest request (prevents stale race conditions)
    if (seq === reloadSeqRef.current) {
      setOrr(res.orr);
      setSections(res.sections.sort((a: any, b: any) => a.position - b.position));
    }
  }, [id]);

  // Debounced reload — collapses rapid section_updated events into a single fetch
  const debouncedReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadSections().then(() => setEditingResponses({}));
    }, 300);
  }, [reloadSections]);

  // Reset editing state when switching sections
  useEffect(() => {
    setEditingResponses({});
  }, [activeSection]);

  // Parse a single prompt response value — may be a plain string (legacy) or { answer, source, codeRef }
  const getResponseText = (val: any): string => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (typeof val === "object" && val.answer) return val.answer;
    return "";
  };

  const getResponseSource = (val: any): "team" | "code" | null => {
    if (!val || typeof val === "string") return null;
    return val.source || null;
  };

  const getResponseCodeRef = (val: any): string | null => {
    if (!val || typeof val === "string") return null;
    return val.codeRef || null;
  };

  // Parse promptResponses from a section (handles string or object)
  const parseResponses = (section: any): Record<number, any> => {
    if (!section?.promptResponses) return {};
    const raw = typeof section.promptResponses === "string"
      ? JSON.parse(section.promptResponses)
      : section.promptResponses;
    return raw || {};
  };

  // Auto-save per-question responses with debounce
  const saveResponses = useCallback(
    async (sectionId: string, responses: Record<number, string>) => {
      if (!id) return;
      setSaving(true);
      try {
        await api.sections.update(id, sectionId, { promptResponses: responses });
        // Update local sections state
        setSections((prev) =>
          prev.map((s) => (s.id === sectionId ? { ...s, promptResponses: responses } : s)),
        );
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const handleResponseChange = useCallback(
    (questionIndex: number, value: string) => {
      setEditingResponses((prev) => {
        const updated = { ...prev, [questionIndex]: value };
        // Schedule save
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          if (activeSection) {
            // Merge with existing saved responses
            const currentSection = sections.find((s) => s.id === activeSection);
            const savedResponses = parseResponses(currentSection);
            const merged = { ...savedResponses, ...updated };
            saveResponses(activeSection, merged);
          }
        }, 1000);
        return updated;
      });
    },
    [activeSection, sections, saveResponses],
  );

  const startSession = useCallback(async () => {
    if (!id) return;
    const res = await api.sessions.create(id);
    setSessionId(res.session.id);
    setSessionTokens(0);
    setMessages([]);
  }, [id]);

  const endSession = useCallback(async () => {
    if (!id || !sessionId) return;
    await api.sessions.end(id, sessionId);
    setSessionId(null);
    await reloadSections();
  }, [id, sessionId, reloadSections]);

  const doSend = useCallback(async (userMessage: string) => {
    if (!id || !sessionId || streaming) return;

    lastUserMessageRef.current = userMessage;
    setLastError(null);
    setStreaming(true);
    setStreamStatus(null);

    let assistantContent = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await sendMessage(id, sessionId, userMessage, activeSection, (event) => {
        if (event.type === "content_delta") {
          setStreamStatus(null); // clear status once content flows
          assistantContent += event.content;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantContent,
            };
            return updated;
          });
        }

        if (event.type === "status") {
          setStreamStatus(event.message);
        }

        if (event.type === "error") {
          setLastError(event.message);
          setStreamStatus(null);
        }

        // When AI calls any tool with a section_id, switch to that section
        if (event.type === "tool_call" && event.args?.section_id) {
          setActiveSection(event.args.section_id);
        }

        // When AI writes to a section, switch view and schedule debounced reload
        if (event.type === "section_updated") {
          if (event.sectionId) setActiveSection(event.sectionId);
          debouncedReload();
        }

        if (event.type === "message_end" && event.tokenUsage) {
          setSessionTokens((prev) => prev + event.tokenUsage);
        }

        if (event.type === "session_renewed") {
          setSessionId(event.newSessionId);
          setSessionTokens(0);
          setNotification("Session renewed (token limit reached). Your review continues seamlessly.");
          setTimeout(() => setNotification(null), 8000);
        }
      });
    } catch (err) {
      // Don't overwrite a more specific error from the SSE stream
      setLastError((prev) => prev || "Connection lost. Your conversation is saved — reload the page to continue.");
    }

    setStreamStatus(null);

    // If the stream completed but produced no content, replace the empty
    // placeholder with an inline error so the user sees what happened
    if (!assistantContent.trim()) {
      setLastError((prev) => prev || "No response received. The AI may be overloaded.");
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && !prev[prev.length - 1].content.trim()) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "*Failed to generate a response. Use the Retry button above to try again.*",
          };
          return updated;
        }
        return prev;
      });
    }

    // Always reload sections after stream ends — safety net in case
    // section_updated events were lost (disconnect, server restart, etc.)
    await reloadSections();
    setEditingResponses({});
    setStreaming(false);
  }, [id, sessionId, activeSection, streaming, reloadSections, debouncedReload]);

  const filteredSlashCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.name.startsWith(slashFilter.toLowerCase()),
  );

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    setInput("");
    setShowSlashMenu(false);
    setSlashFilter("");
    setSlashSelectedIndex(0);
    // Show the command name as the user message, send the expanded prompt
    setMessages((prev) => [...prev, { role: "user", content: `/${cmd.name}` }]);
    doSend(cmd.prompt);
  }, [doSend]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val === "/") {
      setShowSlashMenu(true);
      setSlashFilter("");
      setSlashSelectedIndex(0);
    } else if (val.startsWith("/") && !val.includes(" ")) {
      setShowSlashMenu(true);
      setSlashFilter(val.slice(1));
      setSlashSelectedIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !id || !sessionId || streaming) return;
    setShowSlashMenu(false);
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    await doSend(userMessage);
  }, [input, id, sessionId, streaming, doSend]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashMenu && filteredSlashCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIndex((prev) => Math.min(prev + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSlashSelect(filteredSlashCommands[slashSelectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [showSlashMenu, filteredSlashCommands, slashSelectedIndex, handleSlashSelect, handleSend]);

  const handleRetry = useCallback(async () => {
    if (!lastUserMessageRef.current || streaming) return;
    setLastError(null);
    await doSend(lastUserMessageRef.current);
  }, [streaming, doSend]);

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

  // Count answered questions per section (for the sidebar)
  const answeredCount = (section: any): number => {
    const responses = parseResponses(section);
    return Object.values(responses).filter((v) => getResponseText(v).trim().length > 0).length;
  };
  // Count code-sourced answers in a section
  const codeSourcedCount = (section: any): number => {
    const responses = parseResponses(section);
    return Object.values(responses).filter((v) => getResponseSource(v) === "code").length;
  };
  const totalQuestions = (section: any): number => {
    const prompts = typeof section.prompts === "string"
      ? JSON.parse(section.prompts)
      : section.prompts;
    return (prompts || []).length;
  };

  return (
    <div className="flex h-screen">
      {/* Column 1: Section sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50 overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-gray-200">
          <Link to="/orrs" className="text-[10px] text-gray-400 hover:text-blue-600">&larr; All ORRs</Link>
          <h2 className="font-bold text-sm text-gray-900 truncate mt-1">{orr.serviceName}</h2>
          <div className="text-[10px] text-gray-500 mt-1">{orr.status.replace("_", " ")}</div>

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
            const codeSourced = codeSourcedCount(s);
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
                  {codeSourced > 0 && (
                    <span className="ml-1 text-purple-500" title={`${codeSourced} answer${codeSourced > 1 ? "s" : ""} sourced from code`}>
                      ({codeSourced} from code)
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
            {(["review", "dependencies", "traces"] as const).map((tab) => (
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

        {activeTab === "traces" ? (
          <TracesPanel orrId={id!} />
        ) : activeTab === "dependencies" ? (
          <DependenciesPanel orrId={id!} serviceName={orr.serviceName} sections={sections} />
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
                {saving && <span className="text-[10px] text-gray-400 ml-auto">Saving...</span>}
              </div>
              {currentSection.depthRationale && (
                <p className="text-xs text-gray-400 mt-1 italic">{currentSection.depthRationale}</p>
              )}
            </div>

            {/* Questions list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentPrompts.map((prompt: string, i: number) => {
                const isEditing = editingResponses[i] !== undefined;
                const rawValue = savedResponses[i];
                const savedValue = getResponseText(rawValue);
                const source = getResponseSource(rawValue);
                const codeRef = getResponseCodeRef(rawValue);
                const responseValue = isEditing ? editingResponses[i] : savedValue;
                const isAnswered = (savedValue || editingResponses[i] || "").trim().length > 0;

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
                          onChange={(e) => handleResponseChange(i, e.target.value)}
                          onBlur={() => {
                            // Exit editing mode — if value matches saved, just clear editing state
                            setEditingResponses((prev) => {
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
                          onClick={() => setEditingResponses((prev) => ({ ...prev, [i]: savedValue }))}
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
                          onClick={() => setEditingResponses((prev) => ({ ...prev, [i]: "" }))}
                          className="w-full bg-gray-50 rounded border border-gray-200 border-dashed p-2.5 text-sm text-gray-400 cursor-text hover:border-gray-300 transition-colors"
                        >
                          Click to answer, or let the AI capture your response during the review...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* AI Observations (content field) */}
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
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SEVERITY_COLORS[f.severity] || "bg-gray-200"}`}>
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
                                        reloadSections();
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
                                        reloadSections();
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
                                    reloadSections();
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

      {/* Column 3: AI conversation */}
      <div className="w-[40%] flex-shrink-0 flex flex-col bg-white border-l border-gray-200">
        {/* Session controls */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-medium text-gray-900 text-sm">AI Assistant</h3>
          {sessionId ? (
            <div className="flex items-center gap-3">
              {sessionTokens > 0 && (
                <span className="text-[10px] text-gray-400">
                  {Math.round(sessionTokens / 1000)}k tokens
                </span>
              )}
              <button
                onClick={endSession}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                End Session
              </button>
            </div>
          ) : (
            <button
              onClick={startSession}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Start AI Session
            </button>
          )}
        </div>

        {/* Session renewal notification */}
        {notification && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-700 flex items-center justify-between">
            <span>{notification}</span>
            <button onClick={() => setNotification(null)} className="text-blue-400 hover:text-blue-600 ml-2">&times;</button>
          </div>
        )}

        {/* Retry status (shown while LLM is retrying) */}
        {streamStatus && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex items-center gap-2">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>{streamStatus}</span>
          </div>
        )}

        {/* Error banner with retry */}
        {lastError && !streaming && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center justify-between">
            <span>{lastError}</span>
            <div className="flex items-center gap-2 ml-4 shrink-0">
              <button
                onClick={handleRetry}
                className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 font-medium"
              >
                Retry
              </button>
              <button onClick={() => setLastError(null)} className="text-red-400 hover:text-red-600">&times;</button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!sessionId && messages.length === 0 && (
            <div className="text-center text-gray-400 text-sm mt-8">
              <p>Start an AI session to get help reviewing this ORR.</p>
              <p className="mt-2 text-xs">
                The AI will help you think through questions, share relevant lessons, and assess depth.
              </p>
              <p className="mt-4 text-xs text-gray-300">
                You can also answer questions directly without AI.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`text-sm ${
                msg.role === "user"
                  ? "ml-8 bg-blue-50 rounded-lg p-3"
                  : "mr-8 bg-gray-50 rounded-lg p-3"
              }`}
            >
              <div className="text-[10px] text-gray-400 mb-1 uppercase">
                {msg.role === "user" ? "You" : "AI Assistant"}
              </div>
              <div className="leading-relaxed">
                {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {sessionId && (
          <div className="p-4 border-t border-gray-200">
            <div className="flex gap-2 relative">
              {/* Slash command dropdown */}
              {showSlashMenu && filteredSlashCommands.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-10">
                  <div className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    Commands
                  </div>
                  {filteredSlashCommands.map((cmd, i) => (
                    <button
                      key={cmd.name}
                      onClick={() => handleSlashSelect(cmd)}
                      onMouseEnter={() => setSlashSelectedIndex(i)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-3 text-sm ${
                        i === slashSelectedIndex
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="font-mono text-xs text-blue-500">/{cmd.name}</span>
                      <span className="text-xs text-gray-500">{cmd.description}</span>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onBlur={() => setTimeout(() => setShowSlashMenu(false), 150)}
                placeholder={speech.isListening ? "Listening..." : "Type a message or / for commands... (Shift+Enter for new line)"}
                disabled={streaming}
                rows={1}
                className={`flex-1 px-3 py-2 border rounded text-sm focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 resize-none overflow-hidden ${
                  speech.isListening ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
                style={{ minHeight: "38px", maxHeight: "160px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 160) + "px";
                }}
              />
              {speech.isSupported && (
                <button
                  onClick={speech.toggle}
                  disabled={streaming}
                  title={speech.isListening ? "Stop listening" : "Voice input"}
                  className={`px-3 py-2 rounded text-sm font-medium disabled:opacity-50 ${
                    speech.isListening
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {speech.isListening ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <rect x="5" y="5" width="10" height="10" rx="1" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M7 4a3 3 0 0 1 6 0v6a3 3 0 1 1-6 0V4Z" />
                      <path d="M5.5 9.643a.75.75 0 0 0-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-1.5v-1.546A6.001 6.001 0 0 0 16 10v-.357a.75.75 0 0 0-1.5 0V10a4.5 4.5 0 0 1-9 0v-.357Z" />
                    </svg>
                  )}
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={streaming || !input.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {streaming ? "..." : "Send"}
              </button>
            </div>
            {activeSection && currentSection && (
              <div className="mt-1 text-[10px] text-gray-400">
                Discussing: {currentSection.title}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
