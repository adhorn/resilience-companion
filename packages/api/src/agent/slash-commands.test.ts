/**
 * TDD tests for structured slash command handling.
 * Written BEFORE implementation — these define the contract.
 *
 * The slash command handler should:
 * 1. Detect write slash commands from the displayContent field
 * 2. Tell the agent to return structured JSON
 * 3. Parse the JSON from the agent's response
 * 4. Validate with Zod
 * 5. Write to DB deterministically
 * 6. Return a SlashCommandResult for the UI to render
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb, seedTestOrr, seedTestSession } from "../test-helpers.js";
import type { SlashCommandResult, SlashExperiment, SlashDependency, SlashDiscovery } from "@orr/shared";
import { WRITE_SLASH_COMMANDS } from "@orr/shared";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";

// Import will fail until implemented — that's TDD
import { parseSlashResponse, persistSlashResult, isWriteSlashCommand } from "./slash-commands.js";

describe("isWriteSlashCommand", () => {
  it("detects write slash commands", () => {
    expect(isWriteSlashCommand("/experiments")).toBe(true);
    expect(isWriteSlashCommand("/dependencies")).toBe(true);
    expect(isWriteSlashCommand("/learning")).toBe(true);
    expect(isWriteSlashCommand("/actions")).toBe(true);
    expect(isWriteSlashCommand("/timeline")).toBe(true);
    expect(isWriteSlashCommand("/factors")).toBe(true);
  });

  it("rejects read-only slash commands", () => {
    expect(isWriteSlashCommand("/summarize")).toBe(false);
    expect(isWriteSlashCommand("/depth")).toBe(false);
    expect(isWriteSlashCommand("/status")).toBe(false);
    expect(isWriteSlashCommand("/risks")).toBe(false);
  });

  it("rejects non-slash messages", () => {
    expect(isWriteSlashCommand("tell me about experiments")).toBe(false);
    expect(isWriteSlashCommand("")).toBe(false);
  });
});

describe("parseSlashResponse", () => {
  it("parses experiments from agent JSON response", () => {
    const agentResponse = JSON.stringify({
      command: "experiments",
      summary: "Three high-priority experiments identified.",
      items: [
        {
          type: "load_test",
          title: "Retry Storm Under Concurrent Load",
          hypothesis: "When 10 concurrent sessions hit rate limits, retry storms amplify load",
          rationale: "No jitter in retry logic",
          priority: "high",
        },
      ],
    });

    const result = parseSlashResponse("/experiments", agentResponse);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("experiments");
    expect(result!.items).toHaveLength(1);
    expect((result!.items[0] as SlashExperiment).title).toBe("Retry Storm Under Concurrent Load");
    expect(result!.summary).toBe("Three high-priority experiments identified.");
  });

  it("parses dependencies from agent JSON response", () => {
    const agentResponse = JSON.stringify({
      command: "dependencies",
      summary: "One new dependency found.",
      items: [
        { name: "Zod", type: "library", criticality: "medium" },
      ],
    });

    const result = parseSlashResponse("/dependencies", agentResponse);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("dependencies");
    expect(result!.items).toHaveLength(1);
    expect((result!.items[0] as SlashDependency).name).toBe("Zod");
  });

  it("parses learning discoveries from agent JSON response", () => {
    const agentResponse = JSON.stringify({
      command: "learning",
      summary: "Two learning signals identified.",
      items: [
        { text: "Team discovered retry logic has no jitter" },
        { text: "Team couldn't recall circuit breaker configuration" },
      ],
    });

    const result = parseSlashResponse("/learning", agentResponse);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("learning");
    expect(result!.items).toHaveLength(2);
  });

  it("handles JSON embedded in markdown text", () => {
    const agentResponse = `Here are the experiments I found:

\`\`\`json
${JSON.stringify({
      command: "experiments",
      summary: "One experiment.",
      items: [{ type: "chaos_experiment", title: "Test", hypothesis: "H", rationale: "R", priority: "medium" }],
    })}
\`\`\`

Let me know if you want to discuss any of these.`;

    const result = parseSlashResponse("/experiments", agentResponse);
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
  });

  it("returns null for completely invalid response", () => {
    const result = parseSlashResponse("/experiments", "I couldn't find any experiments to suggest.");
    expect(result).toBeNull();
  });

  it("filters out invalid items but keeps valid ones", () => {
    const agentResponse = JSON.stringify({
      command: "experiments",
      summary: "Mixed results.",
      items: [
        { type: "chaos_experiment", title: "Valid", hypothesis: "H", rationale: "R", priority: "high" },
        { type: "invalid_type", title: "Bad", hypothesis: "H", rationale: "R", priority: "high" },
      ],
    });

    const result = parseSlashResponse("/experiments", agentResponse);
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect((result!.items[0] as SlashExperiment).title).toBe("Valid");
  });
});

describe("persistSlashResult", () => {
  let db: ReturnType<typeof setupTestDb>;
  let orrId: string;
  let sectionIds: string[];
  let sessionId: string;

  beforeEach(() => {
    db = setupTestDb();
    const seed = seedTestOrr(db);
    orrId = seed.orrId;
    sectionIds = seed.sectionIds;
    sessionId = seedTestSession(db, orrId, seed.userId);
  });

  it("persists experiments to DB", () => {
    const result: SlashCommandResult = {
      command: "experiments",
      summary: "Two experiments.",
      items: [
        { type: "chaos_experiment", title: "LLM Failure Test", hypothesis: "When LLM is down...", rationale: "Critical path", priority: "high" },
        { type: "load_test", title: "Concurrent Sessions", hypothesis: "When 10 users...", rationale: "SQLite limits", priority: "critical" },
      ],
    };

    const written = persistSlashResult(result, "orr", orrId, sessionId);
    expect(written).toBe(2);

    const experiments = db.select().from(schema.experimentSuggestions).all();
    expect(experiments).toHaveLength(2);
    expect(experiments.some((e) => e.title === "LLM Failure Test")).toBe(true);
    expect(experiments.some((e) => e.title === "Concurrent Sessions")).toBe(true);
  });

  it("persists dependencies to DB", () => {
    const result: SlashCommandResult = {
      command: "dependencies",
      summary: "One dependency.",
      items: [
        { name: "Zod", type: "library", criticality: "medium" },
      ],
    };

    const written = persistSlashResult(result, "orr", orrId, sessionId);
    expect(written).toBe(1);

    const deps = db.select().from(schema.dependencies).where(eq(schema.dependencies.orrId, orrId)).all();
    expect(deps.some((d) => d.name === "Zod")).toBe(true);
  });

  it("persists discoveries to DB", () => {
    const result: SlashCommandResult = {
      command: "learning",
      summary: "One discovery.",
      items: [
        { text: "Team discovered retry has no jitter" },
      ],
    };

    const written = persistSlashResult(result, "orr", orrId, sessionId);
    expect(written).toBe(1);

    const discoveries = db.select().from(schema.discoveries).all();
    expect(discoveries.some((d) => d.text === "Team discovered retry has no jitter")).toBe(true);
  });

  it("deduplicates against existing data", () => {
    const now = new Date().toISOString();

    // Need a service for the experiment to link to — seed BEFORE the experiment
    db.insert(schema.services).values({
      id: "test-service",
      name: "Test Service",
      teamId: "test-team",
      createdAt: now,
      updatedAt: now,
    }).run();
    db.update(schema.orrs).set({ serviceId: "test-service" }).where(eq(schema.orrs.id, orrId)).run();

    // Seed an existing experiment
    db.insert(schema.experimentSuggestions).values({
      id: "existing-exp",
      serviceId: "test-service",
      sourcePracticeType: "orr",
      sourcePracticeId: orrId,
      type: "chaos_experiment",
      title: "LLM Failure Test",
      hypothesis: "existing",
      rationale: "existing",
      priority: "high",
      priorityReasoning: "",
      status: "suggested",
      createdAt: now,
      updatedAt: now,
    }).run();

    const result: SlashCommandResult = {
      command: "experiments",
      summary: "One new, one duplicate.",
      items: [
        { type: "chaos_experiment", title: "LLM Failure Test", hypothesis: "same thing", rationale: "same", priority: "high" },
        { type: "load_test", title: "New Test", hypothesis: "new", rationale: "new", priority: "medium" },
      ],
    };

    const written = persistSlashResult(result, "orr", orrId, sessionId);
    expect(written).toBe(1); // Only the new one

    const experiments = db.select().from(schema.experimentSuggestions).all();
    expect(experiments).toHaveLength(2); // Original + new
  });

  it("returns 0 for empty items", () => {
    const result: SlashCommandResult = {
      command: "experiments",
      summary: "Nothing found.",
      items: [],
    };

    const written = persistSlashResult(result, "orr", orrId, sessionId);
    expect(written).toBe(0);
  });
});
