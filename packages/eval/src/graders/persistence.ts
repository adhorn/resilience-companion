/**
 * Persistence grader — code-based, deterministic.
 *
 * Checks whether topics discussed in conversation were actually written back
 * to the database. This catches the "discussed but not persisted" failure mode,
 * which is the most critical quality regression for a document-first agent.
 */

import type { HarnessResult, ExpectedOutcome, GraderResult } from "../types.js";
import { schema } from "@orr/api/src/db/index.js";

type SectionRow = {
  id: string;
  title: string;
  depth: string;
  promptResponses: unknown;
  flags: unknown;
};

export function gradePersistence(
  result: HarnessResult,
  outcomes: ExpectedOutcome[],
): GraderResult[] {
  const graderResults: GraderResult[] = [];

  // Read all sections from the final DB state
  const sections = result.db.select().from(schema.sections).all() as SectionRow[];

  for (const outcome of outcomes) {
    if (outcome.type === "question_persisted") {
      graderResults.push(gradeQuestionPersisted(sections, result, outcome));
    }

    if (outcome.type === "tool_called") {
      graderResults.push(gradeToolCalled(result, outcome));
    }

    if (outcome.type === "tool_not_called") {
      graderResults.push(gradeToolNotCalled(result, outcome));
    }

    if (outcome.type === "depth_set") {
      graderResults.push(gradeDepthSet(sections, result, outcome));
    }

    if (outcome.type === "flag_set") {
      graderResults.push(gradeFlagSet(result, outcome));
    }
  }

  return graderResults;
}

function gradeQuestionPersisted(
  sections: SectionRow[],
  result: HarnessResult,
  outcome: ExpectedOutcome,
): GraderResult {
  const sectionIndex = outcome.sectionIndex ?? 0;
  const questionIndex = outcome.questionIndex ?? 0;
  const sectionId = result.sectionIds[sectionIndex];

  if (!sectionId) {
    return {
      grader: "persistence",
      outcomeDescription: outcome.description,
      passed: false,
      details: `Section at index ${sectionIndex} does not exist (only ${result.sectionIds.length} sections seeded)`,
    };
  }

  const section = sections.find((s) => s.id === sectionId);
  if (!section) {
    return {
      grader: "persistence",
      outcomeDescription: outcome.description,
      passed: false,
      details: `Section ${sectionId} not found in DB after conversation`,
    };
  }

  const responses = section.promptResponses as Record<string, unknown> | null;
  const raw = responses?.[String(questionIndex)];
  // Responses can be plain strings OR objects with {answer, source, codeRef}
  const responseText = typeof raw === "string"
    ? raw
    : (raw && typeof raw === "object" && "answer" in raw) ? (raw as {answer: string}).answer : "";
  const hasContent = responseText.trim().length > 0;

  return {
    grader: "persistence",
    outcomeDescription: outcome.description,
    passed: hasContent,
    details: hasContent
      ? `Question ${questionIndex} in section "${section.title}" persisted (${responseText.length} chars)`
      : `Question ${questionIndex} in section "${section.title}" was NOT persisted (promptResponses[${questionIndex}] is empty or missing)`,
  };
}

function gradeToolCalled(result: HarnessResult, outcome: ExpectedOutcome): GraderResult {
  const tool = outcome.tool!;
  const called = result.toolCalls.some((tc) => tc.tool === tool);
  return {
    grader: "persistence",
    outcomeDescription: outcome.description,
    passed: called,
    details: called
      ? `Tool "${tool}" was called (${result.toolCalls.filter((tc) => tc.tool === tool).length} times)`
      : `Tool "${tool}" was never called. Tools used: ${[...new Set(result.toolCalls.map((tc) => tc.tool))].join(", ") || "none"}`,
  };
}

function gradeToolNotCalled(result: HarnessResult, outcome: ExpectedOutcome): GraderResult {
  const tool = outcome.tool!;
  const called = result.toolCalls.some((tc) => tc.tool === tool);
  return {
    grader: "persistence",
    outcomeDescription: outcome.description,
    passed: !called,
    details: called
      ? `Tool "${tool}" was called ${result.toolCalls.filter((tc) => tc.tool === tool).length} time(s) — expected NOT to be called`
      : `Tool "${tool}" was correctly NOT called`,
  };
}

function gradeDepthSet(
  sections: SectionRow[],
  result: HarnessResult,
  outcome: ExpectedOutcome,
): GraderResult {
  const sectionIndex = outcome.sectionIndex ?? 0;
  const sectionId = result.sectionIds[sectionIndex];
  const expectedDepth = outcome.depth!;

  if (!sectionId) {
    return {
      grader: "persistence",
      outcomeDescription: outcome.description,
      passed: false,
      details: `Section at index ${sectionIndex} does not exist`,
    };
  }

  const section = sections.find((s) => s.id === sectionId);
  const actualDepth = section?.depth ?? "UNKNOWN";
  const passed = actualDepth === expectedDepth;

  return {
    grader: "persistence",
    outcomeDescription: outcome.description,
    passed,
    details: passed
      ? `Section "${section?.title}" depth correctly set to ${expectedDepth}`
      : `Section "${section?.title}" depth is ${actualDepth}, expected ${expectedDepth}`,
  };
}

function gradeFlagSet(result: HarnessResult, outcome: ExpectedOutcome): GraderResult {
  const called = result.toolCalls.some((tc) => tc.tool === "set_flags");
  return {
    grader: "persistence",
    outcomeDescription: outcome.description,
    passed: called,
    details: called
      ? `set_flags was called ${result.toolCalls.filter((tc) => tc.tool === "set_flags").length} time(s)`
      : "set_flags was never called — expected at least one flag to be set",
  };
}
