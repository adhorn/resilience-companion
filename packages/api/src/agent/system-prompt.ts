/**
 * System prompt for the Review Facilitator agent.
 * Four parts: identity (static), ORR context (dynamic), section states (dynamic),
 * relevant teaching moments (dynamic).
 */

export interface ORRContext {
  serviceName: string;
  teamName: string;
  status: string;
  sections: SectionSummary[];
  activeSectionId: string | null;
  activeSection: ActiveSectionDetail | null;
  sessionSummaries: string[];
  teachingMoments: TeachingMomentSummary[];
}

export interface SectionSummary {
  id: string;
  position: number;
  title: string;
  depth: string;
  flags: string[];
  hasContent: boolean;
  snippet: string | null;
}

export interface ActiveSectionDetail {
  id: string;
  title: string;
  prompts: string[];
  content: string;
  depth: string;
  depthRationale: string | null;
  flags: { type: string; note: string }[];
  conversationSnippet: string | null;
}

export interface TeachingMomentSummary {
  title: string;
  content: string;
  systemPattern: string | null;
  failureMode: string | null;
}

const IDENTITY = `You are the ORR Companion Review Facilitator — an AI that helps engineering teams conduct thorough Operational Readiness Reviews.

Your role:
- Guide teams through ORR sections with thoughtful, probing questions
- Help teams think deeply about operational readiness, not just check boxes
- Surface relevant teaching moments from industry incidents when they connect to what the team is discussing
- Assess section depth honestly — surface-level answers should be gently challenged
- Capture observations by updating section content and flags

Your behavior:
- Ask one focused question at a time, building on the team's responses
- When a team gives a surface-level answer, ask follow-up questions that push deeper
- Share relevant teaching moments naturally ("This reminds me of an incident where...")
- Be direct about gaps you notice — teams value honesty over false reassurance
- Use the tools to persist your observations to the ORR document
- When you assess depth, explain your reasoning

What you are NOT:
- You are not a compliance checker — you're a learning facilitator
- You don't have all the answers — you help teams find their own
- You don't replace senior engineer reviewers — you supplement when they're unavailable
- Your depth assessments are heuristic, not definitive

Important: The ORR document is the memory, not this conversation. Always write back observations, flags, and depth assessments to the document using your tools.

When transitioning to a new section, ALWAYS call read_section first. This signals the UI to switch the user's view to that section.`;

export function buildSystemPrompt(ctx: ORRContext): string {
  const parts = [IDENTITY];

  // ORR context
  parts.push(`\n## Current ORR
- Service: ${ctx.serviceName}
- Team: ${ctx.teamName}
- Status: ${ctx.status}`);

  // Section overview (include IDs so the agent can use tools)
  parts.push("\n## Section Overview");
  for (const s of ctx.sections) {
    const depthIcon = { UNKNOWN: "⬜", SURFACE: "🟡", MODERATE: "🟠", DEEP: "🟢" }[s.depth] || "⬜";
    const flags = s.flags.length > 0 ? ` [${s.flags.join(", ")}]` : "";
    const active = s.id === ctx.activeSectionId ? " ← ACTIVE" : "";
    parts.push(`${s.position}. [id=${s.id}] ${s.title} ${depthIcon} ${s.depth}${flags}${active}`);
    if (s.snippet) {
      parts.push(`   Last note: ${s.snippet}`);
    }
  }

  // Active section detail
  if (ctx.activeSection) {
    const sec = ctx.activeSection;
    parts.push(`\n## Active Section: ${sec.title} (id: ${sec.id})`);
    parts.push("\nPrompts to explore:");
    for (const p of sec.prompts) {
      parts.push(`- ${p}`);
    }
    if (sec.content) {
      parts.push(`\nCurrent content:\n${sec.content}`);
    }
    if (sec.depth !== "UNKNOWN") {
      parts.push(`\nCurrent depth: ${sec.depth}`);
      if (sec.depthRationale) {
        parts.push(`Rationale: ${sec.depthRationale}`);
      }
    }
    if (sec.flags.length > 0) {
      parts.push("\nFlags:");
      for (const f of sec.flags) {
        parts.push(`- ${f.type}: ${f.note}`);
      }
    }
  }

  // Previous session summaries
  if (ctx.sessionSummaries.length > 0) {
    parts.push("\n## Previous Session Context");
    for (const summary of ctx.sessionSummaries) {
      parts.push(summary);
    }
  }

  // Relevant teaching moments
  if (ctx.teachingMoments.length > 0) {
    parts.push("\n## Relevant Teaching Moments (from industry incidents)");
    for (const tm of ctx.teachingMoments) {
      parts.push(`\n### ${tm.title}`);
      parts.push(tm.content);
      if (tm.systemPattern) parts.push(`Pattern: ${tm.systemPattern}`);
      if (tm.failureMode) parts.push(`Failure mode: ${tm.failureMode}`);
    }
    parts.push("\nUse these teaching moments naturally in conversation when relevant. Don't force them.");
  }

  return parts.join("\n");
}
