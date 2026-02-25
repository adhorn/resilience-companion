import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { api, sendMessage } from "../api/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

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
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(<p key={key++}>{renderInline(trimmed)}</p>);
    }
  }
  flushList();

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold**, *italic*, `code` patterns
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          const msgRes = await api.sessions.getMessages(id!, activeSession.id);
          if (msgRes.messages.length > 0) {
            setMessages(
              msgRes.messages.map((m: any) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
            );
          }
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

  // Helper to reload sections from server
  const reloadSections = useCallback(async () => {
    if (!id) return;
    const res = await api.orrs.get(id);
    setOrr(res.orr);
    setSections(res.sections.sort((a: any, b: any) => a.position - b.position));
  }, [id]);

  const startSession = useCallback(async () => {
    if (!id) return;
    const res = await api.sessions.create(id);
    setSessionId(res.session.id);
    setMessages([]);
  }, [id]);

  const endSession = useCallback(async () => {
    if (!id || !sessionId) return;
    await api.sessions.end(id, sessionId);
    setSessionId(null);
    await reloadSections();
  }, [id, sessionId, reloadSections]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !id || !sessionId || streaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setStreaming(true);

    let assistantContent = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await sendMessage(id, sessionId, userMessage, activeSection, (event) => {
        if (event.type === "content_delta") {
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

        // When AI calls any tool with a section_id, switch the left panel to it
        if (event.type === "tool_call" && event.args?.section_id) {
          setActiveSection(event.args.section_id);
        }

        // When AI writes to a section, reload data and switch to it
        if (event.type === "section_updated") {
          if (event.sectionId) setActiveSection(event.sectionId);
          reloadSections();
        }
      });
    } catch (err) {
      const errText = "\n\n*Connection lost. Your conversation is saved — reload the page to continue.*";
      assistantContent += errText;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: assistantContent,
        };
        return updated;
      });
    }

    // If the stream completed but produced no content, show an error
    if (!assistantContent.trim()) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "*No response received. The AI may be overloaded. Send your message again to retry.*",
        };
        return updated;
      });
    }

    setStreaming(false);
  }, [input, id, sessionId, activeSection, streaming, reloadSections]);

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

  return (
    <div className="flex h-screen">
      {/* Left panel: Section nav + content */}
      <div className="w-1/2 border-r border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">{orr.serviceName}</h2>
              <span className="text-xs text-gray-500">{orr.status.replace("_", " ")}</span>
            </div>
            <a
              href={`/api/v1/orrs/${id}/export/markdown`}
              className="text-xs text-blue-600 hover:underline"
            >
              Export MD
            </a>
          </div>

          {/* Coverage map */}
          <div className="mt-3 flex gap-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                title={`${s.title}: ${DEPTH_LABELS[s.depth]}`}
                className={`flex-1 h-3 rounded-sm ${DEPTH_COLORS[s.depth]} ${
                  s.id === activeSection ? "ring-2 ring-blue-500" : ""
                }`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>1</span>
            <span>{sections.length}</span>
          </div>
        </div>

        {/* Section nav */}
        <div className="overflow-y-auto flex-1">
          <div className="p-2 space-y-0.5">
            {sections.map((s) => {
              const flags = typeof s.flags === "string" ? JSON.parse(s.flags) : s.flags;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    s.id === activeSection
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${DEPTH_COLORS[s.depth]}`} />
                    <span className="flex-1 truncate">
                      {s.position}. {s.title}
                    </span>
                    {flags.length > 0 && (
                      <span className="text-[10px] text-gray-400">{flags.length}</span>
                    )}
                  </div>
                  {s.conversationSnippet && (
                    <div className="text-[10px] text-gray-400 mt-0.5 ml-4 truncate">
                      {s.conversationSnippet}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active section detail */}
          {currentSection && (
            <div className="p-4 border-t border-gray-200">
              <h3 className="font-medium text-gray-900 mb-2">{currentSection.title}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <span className={`inline-block w-2 h-2 rounded-full ${DEPTH_COLORS[currentSection.depth]}`} />
                <span>{DEPTH_LABELS[currentSection.depth]}</span>
                {currentSection.depthRationale && (
                  <span className="italic text-gray-400"> — {currentSection.depthRationale}</span>
                )}
              </div>

              {/* Flags */}
              {currentFlags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {currentFlags.map((f: any, i: number) => (
                    <span
                      key={i}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${FLAG_COLORS[f.type] || "bg-gray-100 text-gray-600"}`}
                    >
                      {f.type}: {f.note}
                    </span>
                  ))}
                </div>
              )}

              {/* Prompts */}
              <div className="space-y-1.5 mb-4">
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Prompts</div>
                {currentPrompts.map((p: string, i: number) => (
                  <div key={i} className="text-xs text-gray-600 pl-3 border-l-2 border-gray-200">
                    {p}
                  </div>
                ))}
              </div>

              {/* Content */}
              {currentSection.content ? (
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Notes</div>
                  <div className="bg-gray-50 rounded p-3 text-sm text-gray-700">
                    {renderMarkdown(currentSection.content)}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic">
                  No notes yet. Start an AI session to review this section.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: AI conversation */}
      <div className="w-1/2 flex flex-col bg-white">
        {/* Session controls */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-medium text-gray-900 text-sm">AI Review Session</h3>
          {sessionId ? (
            <button
              onClick={endSession}
              className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              End Session
            </button>
          ) : (
            <button
              onClick={startSession}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Start AI Session
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!sessionId && messages.length === 0 && (
            <div className="text-center text-gray-400 text-sm mt-8">
              <p>Start an AI session to get help reviewing this ORR.</p>
              <p className="mt-2 text-xs">
                The AI will guide you through sections, ask probing questions, and share relevant industry lessons.
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
                {msg.role === "user" ? "You" : "AI Facilitator"}
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
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Type your response..."
                disabled={streaming}
                className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
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
