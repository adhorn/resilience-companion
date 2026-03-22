import React from "react";

/**
 * Render markdown-ish text to React elements.
 * Handles: **bold**, *italic*, `code`, ```fenced code blocks```, bullet lists, numbered lists, paragraphs.
 */
export function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let codeBlock: { lang: string; lines: string[] } | null = null;
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

  function flushCodeBlock() {
    if (!codeBlock) return;
    elements.push(
      <pre key={key++} className="bg-gray-900 text-gray-100 rounded-md p-3 my-2 overflow-x-auto text-xs font-mono leading-relaxed">
        <code>{codeBlock.lines.join("\n")}</code>
      </pre>
    );
    codeBlock = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Fenced code block open/close
    if (trimmed.startsWith("```")) {
      if (codeBlock) {
        // Closing fence
        flushCodeBlock();
      } else {
        // Opening fence — flush any pending list first
        flushList();
        const lang = trimmed.slice(3).trim();
        codeBlock = { lang, lines: [] };
      }
      continue;
    }

    // Inside a code block — collect lines as-is (preserve indentation)
    if (codeBlock) {
      codeBlock.lines.push(line);
      continue;
    }

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
  flushCodeBlock(); // in case of unclosed fence

  return <>{elements}</>;
}

export function renderInline(text: string): React.ReactNode {
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
