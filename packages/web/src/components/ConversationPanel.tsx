import React from "react";
import { SlashResultCard } from "./SlashResultCard";

interface SlashCommand {
  name: string;
  description: string;
  prompt: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  slashResult?: import("@orr/shared").SlashCommandResult;
}

interface SpeechControls {
  isSupported: boolean;
  isListening: boolean;
  toggle: () => void;
}

export interface ConversationPanelProps {
  sessionId: string | null;
  sessionTokens: number;
  streaming: boolean;
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  notification: string | null;
  setNotification: (v: string | null) => void;
  streamStatus: string | null;
  thinkingStatus: string | null;
  lastError: string | null;
  setLastError: (v: string | null) => void;
  handleRetry: () => void;
  startSession: () => void;
  endSession: () => void;
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleSend: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  showSlashMenu: boolean;
  setShowSlashMenu: (v: boolean) => void;
  filteredSlashCommands: SlashCommand[];
  slashSelectedIndex: number;
  setSlashSelectedIndex: (v: number) => void;
  handleSlashSelect: (cmd: SlashCommand) => void;
  speech: SpeechControls;
  discussingTitle: string | null;
  emptyStateText: string;
  emptyStateSubtext: string;
  renderMarkdown: (text: string) => React.ReactNode;
  /** When true, hides session controls and input — review is read-only */
  isReadOnly?: boolean;
  /** Label for the read-only state (e.g. "terminated", "archived") */
  readOnlyReason?: string;
}

export function ConversationPanel({
  sessionId,
  sessionTokens,
  streaming,
  messages,
  messagesEndRef,
  notification,
  setNotification,
  streamStatus,
  thinkingStatus,
  lastError,
  setLastError,
  handleRetry,
  startSession,
  endSession,
  input,
  handleInputChange,
  handleInputKeyDown,
  handleSend,
  inputRef,
  showSlashMenu,
  setShowSlashMenu,
  filteredSlashCommands,
  slashSelectedIndex,
  setSlashSelectedIndex,
  handleSlashSelect,
  speech,
  discussingTitle,
  emptyStateText,
  emptyStateSubtext,
  renderMarkdown,
  isReadOnly = false,
  readOnlyReason,
}: ConversationPanelProps) {
  return (
    <div className="w-[40%] flex-shrink-0 flex flex-col bg-white border-l border-gray-200">
      {/* Session controls */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-medium text-gray-900 text-sm">AI Assistant</h3>
        {isReadOnly ? (
          <span className="text-xs text-gray-400">Read-only</span>
        ) : sessionId ? (
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
        {isReadOnly && messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <p>This review has been {readOnlyReason || "closed"}.</p>
            <p className="mt-2 text-xs">
              The document and conversation history are preserved but no new sessions can be started.
            </p>
          </div>
        )}

        {!isReadOnly && !sessionId && messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <p>{emptyStateText}</p>
            <p className="mt-2 text-xs">
              {emptyStateSubtext}
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
              {msg.role === "assistant"
                ? (msg.slashResult
                    ? <SlashResultCard result={msg.slashResult} />
                    : msg.content
                      ? renderMarkdown(msg.content)
                      : streaming && i === messages.length - 1 && thinkingStatus
                        ? <span className="flex items-center gap-2 text-gray-400 text-xs italic">
                            <span className="inline-flex gap-0.5">
                              <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </span>
                            {thinkingStatus}
                          </span>
                        : "..."
                  )
                : msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {sessionId && !isReadOnly && (
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
          {discussingTitle && (
            <div className="mt-1 text-[10px] text-gray-400">
              Discussing: {discussingTitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
