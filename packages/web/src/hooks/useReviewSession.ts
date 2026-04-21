import { useState, useRef, useCallback, useEffect } from "react";
import { sendSSEMessage } from "../api/client";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { parseResponses } from "../lib/responses";
import { getSpinnerVerb } from "../lib/spinnerVerbs";

export interface SlashCommand {
  name: string;
  description: string;
  prompt: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  slashResult?: import("@orr/shared").SlashCommandResult;
}

interface UseReviewSessionOptions {
  /** Practice ID (ORR ID or Incident ID) */
  practiceId: string | undefined;
  /** SSE message URL builder: given practiceId + sessionId, return full URL */
  buildMessageUrl: (practiceId: string, sessionId: string) => string;
  /** Function to reload data after agent writes */
  reloadData: () => Promise<void>;
  /** Current active section ID */
  activeSection: string | null;
  /** Set active section (e.g. when agent switches focus) */
  setActiveSection: (id: string) => void;
  /** Available slash commands */
  slashCommands: SlashCommand[];
  /** Sections array (for auto-save) */
  sections: any[];
  /** Save responses for a section */
  saveResponses: (sectionId: string, responses: Record<number, string>) => Promise<void>;
  /** Session renewal message text */
  renewalMessage?: string;
}

export function useReviewSession({
  practiceId,
  buildMessageUrl,
  reloadData,
  activeSection,
  setActiveSection,
  slashCommands,
  sections,
  saveResponses,
  renewalMessage = "Session renewed (token limit reached). Your review continues seamlessly.",
}: UseReviewSessionOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Slash command state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save state
  const [editingResponses, setEditingResponses] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEditsRef = useRef<Record<number, string>>({});

  // Debounced reload
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speech = useSpeechRecognition((text) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  });

  // Rotate spinner verb every 3s while thinking (preserves tool-specific labels)
  const spinnerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isToolLabelRef = useRef(false);
  useEffect(() => {
    if (thinkingStatus) {
      spinnerIntervalRef.current = setInterval(() => {
        if (!isToolLabelRef.current) {
          setThinkingStatus(`${getSpinnerVerb()}...`);
        }
      }, 3000);
    } else {
      if (spinnerIntervalRef.current) {
        clearInterval(spinnerIntervalRef.current);
        spinnerIntervalRef.current = null;
      }
      isToolLabelRef.current = false;
    }
    return () => {
      if (spinnerIntervalRef.current) clearInterval(spinnerIntervalRef.current);
    };
  }, [!!thinkingStatus]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset editing state when switching sections
  useEffect(() => {
    setEditingResponses({});
  }, [activeSection]);

  const debouncedReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadData().then(() => setEditingResponses({}));
    }, 300);
  }, [reloadData]);

  // --- Streaming ---

  const doSend = useCallback(async (userMessage: string, displayContent?: string) => {
    if (!practiceId || !sessionId || streaming) return;

    lastUserMessageRef.current = userMessage;
    setLastError(null);
    setStreaming(true);
    setStreamStatus(null);
    setThinkingStatus(`${getSpinnerVerb()}...`);

    let assistantContent = "";
    let messageEnded = false;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const url = buildMessageUrl(practiceId, sessionId);
      await sendSSEMessage(url, userMessage, activeSection, (event) => {
        if (event.type === "content_reset") {
          // New iteration after tool execution — LLM may repeat previous text.
          // Clear accumulated content so only the latest iteration's text is shown.
          assistantContent = "";
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: "" };
            return updated;
          });
        }
        if (event.type === "content_delta") {
          setStreamStatus(null);
          setThinkingStatus(null);
          isToolLabelRef.current = false;
          assistantContent += event.content;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: assistantContent };
            return updated;
          });
        }
        if (event.type === "status" && !messageEnded) {
          setStreamStatus(event.message);
          // On retry/fallback, reset accumulated content — LLM starts fresh
          if (event.message?.includes("Retrying") || event.message?.includes("Response quality")) {
            assistantContent = "";
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: "" };
              return updated;
            });
          }
        }
        if (event.type === "error") { setLastError(event.message); setStreamStatus(null); }
        if (event.type === "tool_call") {
          if (event.args?.section_id) setActiveSection(event.args.section_id);
          const toolLabels: Record<string, string> = {
            read_section: "Reading section...",
            update_section_content: "Writing observations...",
            update_depth_assessment: "Assessing depth...",
            set_flags: "Setting flags...",
            update_question_response: "Recording answer...",
            query_teaching_moments: "Searching teaching moments...",
            query_case_studies: "Searching case studies...",
            write_session_summary: "Writing summary...",
            record_discovery: "Recording discovery...",
            suggest_experiment: "Suggesting experiment...",
            suggest_cross_practice_action: "Connecting practices...",
            record_action_item: "Recording action item...",
            record_contributing_factor: "Recording factor...",
          };
          const label = toolLabels[event.name as string];
          isToolLabelRef.current = !!label;
          setThinkingStatus(label || `${getSpinnerVerb()}...`);
        }
        if (event.type === "section_updated") {
          if (event.sectionId) setActiveSection(event.sectionId);
          // Cancel any pending auto-save — server data wins over stale client edits
          if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
          pendingEditsRef.current = {};
          debouncedReload();
        }
        if (event.type === "data_updated") debouncedReload();
        if (event.type === "slash_result" && event.result) {
          // Replace raw JSON text with summary + structured data for UI rendering
          const sr = event.result;
          assistantContent = sr.summary || assistantContent;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantContent,
              slashResult: sr,
            };
            return updated;
          });
          debouncedReload();
        }
        if (event.type === "message_end") {
          messageEnded = true;
          if (event.tokenUsage) setSessionTokens((prev) => prev + event.tokenUsage);
          // Unblock input immediately — PERSIST runs in the background after this
          setStreamStatus(null);
          setThinkingStatus(null);
          setStreaming(false);
        }
        if (event.type === "session_renewed") {
          setSessionId(event.newSessionId);
          setSessionTokens(0);
          setNotification(renewalMessage);
          setTimeout(() => setNotification(null), 8000);
        }
      }, displayContent);
    } catch {
      setLastError((prev) => prev || "Connection lost. Your conversation is saved — reload the page to continue.");
    }

    setStreamStatus(null);
    setThinkingStatus(null);

    if (!assistantContent.trim()) {
      setLastError((prev) => prev || "No response received. The AI may be overloaded.");
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && !prev[prev.length - 1].content.trim()) {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "*Failed to generate a response. Use the Retry button above to try again.*" };
          return updated;
        }
        return prev;
      });
    }

    // Cancel any pending auto-save before final reload — server data is authoritative
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    pendingEditsRef.current = {};
    await reloadData();
    setEditingResponses({});
    setStreaming(false);
  }, [practiceId, sessionId, activeSection, streaming, buildMessageUrl, reloadData, debouncedReload, setActiveSection, renewalMessage]);

  // --- Slash commands ---

  const filteredSlashCommands = slashCommands.filter((cmd) =>
    cmd.name.startsWith(slashFilter.toLowerCase()),
  );

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    setInput("");
    setShowSlashMenu(false);
    setSlashFilter("");
    setSlashSelectedIndex(0);
    setMessages((prev) => [...prev, { role: "user", content: `/${cmd.name}` }]);
    doSend(cmd.prompt, `/${cmd.name}`);
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
    if (!input.trim() || !practiceId || !sessionId || streaming) return;
    setShowSlashMenu(false);
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    await doSend(userMessage);
  }, [input, practiceId, sessionId, streaming, doSend]);

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

  // --- Auto-save ---

  const handleResponseChange = useCallback(
    (questionIndex: number, value: string) => {
      setEditingResponses((prev) => {
        const updated = { ...prev, [questionIndex]: value };
        pendingEditsRef.current = updated;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          if (activeSection) {
            const currentSection = sections.find((s) => s.id === activeSection);
            const savedResponses = parseResponses(currentSection);
            const merged = { ...savedResponses, ...updated };
            setSaving(true);
            saveResponses(activeSection, merged).finally(() => setSaving(false));
            pendingEditsRef.current = {};
          }
        }, 1000);
        return updated;
      });
    },
    [activeSection, sections, saveResponses],
  );

  const flushPendingEdits = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const pending = pendingEditsRef.current;
    if (Object.keys(pending).length > 0 && activeSection) {
      const currentSection = sections.find((s) => s.id === activeSection);
      const savedResponses = parseResponses(currentSection);
      const merged = { ...savedResponses, ...pending };
      setSaving(true);
      saveResponses(activeSection, merged).finally(() => setSaving(false));
      pendingEditsRef.current = {};
    }
  }, [activeSection, sections, saveResponses]);

  return {
    // Session
    sessionId, setSessionId,
    sessionTokens, setSessionTokens,
    messages, setMessages,
    streaming,
    notification, setNotification,
    streamStatus,
    thinkingStatus,
    lastError, setLastError,
    handleRetry,
    messagesEndRef,

    // Input
    input,
    handleInputChange,
    handleInputKeyDown,
    handleSend,
    inputRef,
    showSlashMenu, setShowSlashMenu,
    filteredSlashCommands,
    slashSelectedIndex, setSlashSelectedIndex,
    handleSlashSelect,
    speech,

    // Auto-save
    editingResponses, setEditingResponses,
    saving,
    handleResponseChange,
    flushPendingEdits,

    // Reload
    debouncedReload,
  };
}
