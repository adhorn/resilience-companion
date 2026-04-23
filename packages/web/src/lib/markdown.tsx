import React from "react";

interface SectionInfo {
  id: string;
  title: string;
}

type NavigateToQuestion = (sectionId: string, questionIndex: number) => void;

// Module-level context for section-aware inline rendering.
// Set by createSectionAwareMarkdown before each render call.
let _sections: SectionInfo[] = [];
let _activeSectionId: string | null = null;
let _onNavigate: NavigateToQuestion | null = null;

/**
 * Create a renderMarkdown function that makes question references clickable.
 * Clicking "Q1 (Architecture)" switches to the Architecture section and scrolls to Q1.
 * References to the currently active section render as plain text (no link needed).
 */
export function createSectionAwareMarkdown(
  sections: SectionInfo[],
  activeSectionId: string | null,
  onNavigate: NavigateToQuestion,
): (text: string) => React.ReactNode {
  return (text: string) => {
    _sections = sections;
    _activeSectionId = activeSectionId;
    _onNavigate = onNavigate;
    const result = renderMarkdown(text);
    _sections = [];
    _activeSectionId = null;
    _onNavigate = null;
    return result;
  };
}

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

/** Scroll to a question element by 0-based index, with a brief highlight */
function scrollToQuestion(index: number) {
  const el = document.getElementById(`question-${index}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("bg-blue-50");
    setTimeout(() => el.classList.remove("bg-blue-50"), 2000);
  }
}

/** Try to find a section by matching its title (case-insensitive, partial) */
function findSection(sectionName: string): SectionInfo | undefined {
  const lower = sectionName.toLowerCase();
  return _sections.find((s) => s.title.toLowerCase() === lower)
    || _sections.find((s) => s.title.toLowerCase().includes(lower))
    || _sections.find((s) => lower.includes(s.title.toLowerCase()));
}

export function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Question references — clickable, scroll to question.
    // "Q1 (Architecture)" → switch section + scroll. Plain "Q1" → scroll in current section.
    if (_onNavigate && _sections.length > 0) {
      // First try: Q1 (Section Name)
      const qWithSection = remaining.match(/^(.*?)\bQ(\d+)\s*\(([^)]+)\)(.*)/s);
      if (qWithSection) {
        const [, before, qNumStr, sectionName, after] = qWithSection;
        const qNum = parseInt(qNumStr, 10);
        const zeroIndex = qNum - 1;
        const section = findSection(sectionName);
        if (before) parts.push(<span key={key++}>{before}</span>);
        const navigate = _onNavigate;
        const targetId = section?.id || _activeSectionId;
        parts.push(
          <button
            key={key++}
            onClick={() => {
              if (targetId && targetId !== _activeSectionId) navigate(targetId, zeroIndex);
              setTimeout(() => scrollToQuestion(zeroIndex), targetId !== _activeSectionId ? 100 : 0);
            }}
            className="inline text-blue-600 hover:text-blue-800 underline decoration-dotted cursor-pointer font-medium"
            title={section ? `Go to Q${qNum} in ${section.title}` : `Scroll to Q${qNum}`}
          >
            Q{qNumStr} ({sectionName})
          </button>
        );
        remaining = after;
        continue;
      }

      // Second: plain Q1, Q2, etc. — scroll within whatever section is currently displayed
      const qPlain = remaining.match(/^(.*?)\bQ(\d+)\b(.*)/s);
      if (qPlain) {
        const [, before, qNumStr, after] = qPlain;
        const qNum = parseInt(qNumStr, 10);
        const zeroIndex = qNum - 1;
        if (before) parts.push(<span key={key++}>{before}</span>);
        parts.push(
          <button
            key={key++}
            onClick={() => scrollToQuestion(zeroIndex)}
            className="inline text-blue-600 hover:text-blue-800 underline decoration-dotted cursor-pointer font-medium"
            title={`Scroll to Q${qNum}`}
          >
            Q{qNumStr}
          </button>
        );
        remaining = after;
        continue;
      }
    }

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
