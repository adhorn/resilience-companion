# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Resilience Companion is a web application for facilitating resilience practices (ORRs, incident analysis, and more), built as a companion tool to the book "Why We Still Suck at Resilience." An AI agent guides teams through structured reviews via Socratic conversation, persisting observations into a document-first data model.

**Current state**: Phase 1 MVP — Review Facilitator + Incident Learning Facilitator agents, teaching moment library, portal, dashboard, markdown export.

**Key design principle**: Document-first. The ORR/incident document is the durable artifact; conversations are ephemeral. The agent uses a **single loop with read and write tools**. An earlier CONVERSE → PERSIST split (read-only conversation + separate structured-JSON extraction pass) was tried and rolled back because the second-phase extraction degraded conversation quality.

## Commands

```bash
npm run dev          # Start API (port 3000) + Web (port 5173) concurrently
npm run build        # Build all packages in order: shared → api → web
npm test             # Vitest — runs tests in packages/*/src/**/*.test.ts
npm run lint         # TypeScript type-check (--noEmit) for api + web + eval
npm run test:mutate  # Stryker mutation testing (config: stryker.config.json)
npm run eval         # Run agent quality evals (requires LLM_API_KEY)
npm run eval:verbose # Run evals with detailed output
```

Run a single test file: `npx vitest run packages/api/src/routes/orrs.test.ts`
Per-workspace dev: `npm run dev -w @orr/shared`, `npm run dev -w @orr/api`, `npm run dev -w @orr/web`

## Testing Practices

- **After any PR that touches agent code, prompts, or tool definitions**: run at least one eval scenario and include the result in the PR.
- **Never trust LLM output format**: when extracting structured data from LLM output (e.g. write slash commands), use `extractJson()` from `agent/persist.ts` — LLMs add preamble, markdown fences, and commentary despite instructions.
- **Integration tests over unit tests for LLM pipelines**: test the full chain (LLM response → extraction → validation → DB write), not just the writer in isolation. Mock the LLM with realistic messy output.

## Architecture

TypeScript monorepo, four npm workspaces. Runtime DB is SQLite only — `db/connection.ts` always uses `better-sqlite3` with `DB_PATH`. A Postgres schema (`db/schema-pg.ts`) and a `DATABASE_URL` env var in `.env.example` exist as scaffolding for a future migration, but neither is wired into the connection layer yet.

### `packages/shared` (@orr/shared)
Pure TypeScript types and constants — no runtime code. **Must be built first.**
- `types.ts` — All entity types and API DTOs
- `constants.ts` — Enums, status types, agent profiles, token budget thresholds, `MAX_AGENT_ITERATIONS`
- `template/default-template.ts` — Default ORR template
- `template/incident-template.ts` — Incident analysis template
- `template/feature-template.ts` — Feature ORR question bank with `generateFeatureTemplate()`

### `packages/api` (@orr/api)
Hono web framework + SQLite (Drizzle ORM + better-sqlite3).

**Boot sequence**: `src/index.ts` → `initDb()` (auto-migrate + seed) → Hono server on port 3000.

**Routes** (19 route files) — each creates `new Hono()`, applies `requireAuth`, mounts at `/api/v1/{resource}`:
- **ORR**: `orrs.ts`, `sections.ts`, `sessions.ts`, `export.ts`, `dependencies.ts`
- **Incidents**: `incidents.ts`, `incident-sections.ts`, `incident-sessions.ts`, `incident-export.ts`
- **Cross-cutting**: `services.ts`, `experiments.ts`, `flags.ts`, `insights.ts`, `learning.ts`, `dashboard.ts`
- **Library**: `teaching-moments.ts`, `case-studies.ts`, `templates.ts`
- **Auth**: `tokens.ts` — PAT creation/revocation

**Auth**: Three-tier middleware chain in `src/middleware/auth.ts`:
1. Proxy headers (`X-Forwarded-Email`) — when `TRUST_PROXY_AUTH=true`, for reverse proxy setups (OAuth2 Proxy, Authelia, Pomerium). Auto-creates users on first login.
2. PAT (`Authorization: Bearer rc_...`) — bcrypt-hashed tokens in `api_tokens` table, with expiry and revocation.
3. Stub fallback — first user in DB, for development on trusted networks.

**Database**: Schema in `src/db/schema.ts`. Pragmas: WAL mode, foreign keys ON, 5s busy timeout. `createTestDb()` available for in-memory test DBs.

Key tables: `orrs` (supports `orrType` service/feature, `parentOrrId` for feature→service linking), `sections`, `sessions`, `sessionMessages`, `incidents`, `services`, `experimentSuggestions`, `discoveries`, `actionItems`, `crossPracticeSuggestions`, `teachingMoments`, `caseStudies`, `orrVersions` (full snapshots on session end), `apiTokens`.

Design decisions: sections store prompts/promptResponses as JSON, teaching moments link by tag (not FK), ORR versions are full snapshots (not incremental), last-writer-wins concurrency.

### `packages/web` (@orr/web)
React 19 + Vite + TailwindCSS + React Query.

**Routes** (React Router v7):
- `/dashboard` — Stats, staleness, coverage, recent activity
- `/orrs`, `/orrs/new` — ORR list and creation wizard
- `/orrs/:id` — Full-screen split-pane: section nav + prompts/conversation with AI
- `/incidents`, `/incidents/new`, `/incidents/:id` — Incident analysis (same pattern as ORRs)
- `/insights` — Discoveries, action items, cross-practice suggestions
- `/flags` — Aggregated risk/gap flags across all ORRs
- `/learn` — Browse teaching moments and case studies
- `/settings` — PAT management, user settings

**API client** (`src/api/client.ts`): Pure fetch, resource-based (`api.orrs.list()`, etc.). SSE for agent messages via native ReadableStream.

In production, built web assets are copied to `packages/api/public/` and served by Hono with SPA fallback.

### `packages/eval` (@orr/eval)
Scenario-based agent quality harness. Drives the agent with a simulated user, scores outputs against graders. Entry point: `src/run.ts`. Layout: `harness.ts`, `runner.ts`, `simulated-user.ts`, `graders/`, `scenarios/`.

## Agent System

POST `/api/v1/orrs/:orrId/sessions/:sessionId/messages` → `runAgent()` in `agent/loop.ts`. **Single loop with both read and write tools** — no separate persistence phase. (An earlier CONVERSE → PERSIST split was rolled back; see Key design principle.)

**Loop flow** (`agent/loop.ts`):
1. Build context + system prompt via `PracticeConfig`; inject token-budget warnings at 75% / 90% of `MAX_SESSION_TOKENS`.
2. Run engagement detection (`agent/engagement.ts`) and inject adaptive guidance for `FRUSTRATED` or `TOO_EASY` zones.
3. Stream LLM response. On tool calls: run steering before-hooks → execute → run after-hooks → append result → iterate.
4. Iteration cap: `MAX_AGENT_ITERATIONS = 5` default, dynamically extended up to 10 when code-exploration tools (`search_code`, `read_file`, `list_directory`) are called.
5. If the loop ends on a tool result, give the LLM one final text-only turn to wrap up coherently.

**Practice abstraction** — the loop is practice-agnostic and delegates to a `PracticeConfig` (`agent/practice.ts`). Each practice lives under `packages/api/src/practices/{orr,incident,shared}/` and supplies: context builder, system prompt, tool defs, tool executor, steering hooks, and section/data-update tool maps used to emit SSE events. Shared tools (section writes, session summary) come from `practices/shared/tools.ts`.

**Tools** (a non-exhaustive list — see each practice's `tools.ts`):
- Read: `read_section`, `query_teaching_moments`, `query_case_studies` (shared); `search_code`, `read_file`, `list_directory` (ORR-only, gated on repository config).
- Write: `update_question_response`, `write_section_content`, `write_depth_assessment`, `flag`, `record_dependency`, `write_session_summary`, plus incident-specific writes (timeline events, contributing factors).

**Write slash commands** (`/experiments`, `/learning`, etc., in `agent/slash-commands.ts`): the agent returns structured JSON instead of conversational text. Streaming is suppressed; after the loop, the JSON is parsed via `extractJson` (the surviving piece of `persist.ts`) and persisted directly.

**Steering hooks** (`agent/hooks/`): before-hooks can block or guide tool calls; after-hooks rewrite results. Security hooks block sensitive file access (`.env`, `.pem`, SSH keys) and redact credentials. Content-scan hooks enforce size limits (~10KB per result, ~20 search matches).

**Agent profiles** (`packages/shared/src/constants.ts`, 6 defined, 2 implemented): `REVIEW_FACILITATOR`, `INCIDENT_LEARNING_FACILITATOR` (active); `SESSION_ASSISTANT`, `TRANSCRIPT_PROCESSOR`, `DRIFT_ANALYST`, `PREP_BRIEF_GENERATOR` (planned).

**Engagement detection** (`agent/engagement.ts`): heuristic over conversation history. `FRUSTRATED` zone (hedging, terse responses, hitting a wall) lowers the code-exploration barrier and asks simpler questions. `TOO_EASY` zone (fluent overconfident answers at shallow depth) pushes deeper with harder predictions and refuses to volunteer code lookups.

## LLM Integration

Pluggable adapter pattern in `src/llm/`. `getLLM()` singleton auto-detects provider:
- `LLM_PROVIDER=bedrock` → `BedrockAdapter` (AWS credential chain, shortnames: `sonnet` → Bedrock model IDs)
- `sk-ant-*` key → `AnthropicAdapter` (native SDK, shortnames: `sonnet` → `claude-sonnet-4-20250514`)
- Other keys → `OpenAICompatibleAdapter` (OpenAI, Azure, Ollama via `LLM_BASE_URL`)
- No key → `NoOpAdapter` (app works without LLM as a structured review tool)

## Environment Variables

See `.env.example` for the full annotated list. Key variables:

```
DB_PATH=./data/resilience-companion.db   # SQLite path (relative to monorepo root)
# DATABASE_URL is documented in .env.example for a future Postgres mode, but the connection layer doesn't read it yet
LLM_API_KEY=                       # Anthropic (sk-ant-*) or OpenAI-compatible; not needed for Bedrock
LLM_MODEL=                         # Shortnames: sonnet, opus, haiku; or full model ID
LLM_FALLBACK_MODEL=                # Optional fallback model for RetryAdapter
LLM_PROVIDER=                      # Optional: bedrock (auto-detected from key if not set)
LLM_BASE_URL=                      # Optional, for OpenAI-compatible endpoints
AWS_REGION=                        # Optional, for Bedrock (defaults to us-east-1)
TRUST_PROXY_AUTH=                  # Set to "true" behind a reverse proxy with auth headers
JWT_SECRET=                        # Optional; encrypts repo tokens at rest. Auto-generated to data/.encryption-key if unset
PORT=3000
```

Code-exploration tools (`search_code`, `read_file`, `list_directory`) only work when an ORR has a configured repository — repo cloning and token decryption live in `packages/api/src/git.ts` (cloned repos under `repos/`).
