# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Resilience Companion is a web application for facilitating resilience practices (ORRs, incident analysis, and more), built as a companion tool to the book "Why We Still Suck at Resilience." An AI agent guides teams through structured reviews via Socratic conversation, persisting observations into a document-first data model.

**Current state**: Phase 1 MVP — Review Facilitator + Incident Learning Facilitator agents, teaching moment library, portal, dashboard, markdown export.

**Key design principle**: Document-first. The ORR/incident document is the durable artifact; conversations are ephemeral. The agent system uses a CONVERSE → PERSIST state machine: the conversational LLM has read-only tools, then a separate PERSIST phase extracts observations as structured JSON and writes deterministically to the DB.

## Commands

```bash
npm run eval            # Run agent quality evals (requires LLM_API_KEY)
npm run eval:verbose    # Run evals with detailed output
```

## Testing Practices

- **After any PR that touches agent code, prompts, or the persist phase**: run at least one eval scenario (`npm run eval -- --scenario persist-basic-qa`) and include the result in the PR.
- **Never trust LLM output format**: any time we ask an LLM for structured data, extract it defensively (use `extractJson()` from `persist.ts`). LLMs add preamble, markdown fences, and commentary despite instructions.
- **Integration tests over unit tests for LLM pipelines**: test the full chain (LLM response → extraction → validation → DB write), not just the writer in isolation. Mock the LLM with realistic messy output.

```bash
npm run dev          # Start API (port 3000) + Web (port 5173) concurrently
npm run build        # Build all packages in order: shared → api → web
npm test             # Vitest — runs tests in packages/*/src/**/*.test.ts
npm run lint         # TypeScript type-check (--noEmit) for api + web
```

Per-workspace: `npm run dev -w @orr/shared`, `npm run dev -w @orr/api`, `npm run dev -w @orr/web`

## Architecture

TypeScript monorepo, three npm workspaces. SQLite database (Postgres planned).

### `packages/shared` (@orr/shared)
Pure TypeScript types and constants — no runtime code. **Must be built first.**
- `types.ts` — All entity types and API DTOs
- `constants.ts` — Enums, status types, agent profiles, token budget thresholds
- `template/default-template.ts` — 11-section ORR template with 121 prompts from the book's appendix
- `template/incident-template.ts` — 14-section incident analysis template with 99 prompts
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

## Agent System

POST `/api/v1/orrs/:orrId/sessions/:sessionId/messages` → `runAgent()` in `agent/loop.ts`. Two-phase state machine:

**CONVERSE phase** — LLM with read-only tools, streams text to the user:
1. Build context (`agent/context.ts`) — active section in full, others as summaries, session history, teaching moments
2. Build system prompt (`agent/system-prompt.ts`) — persona-specific, with engagement zone and token budget guidance
3. LLM converses with read-only tools (max 5 iterations), yields SSE content_delta events

**PERSIST phase** — mandatory, runs after every CONVERSE:
1. Separate LLM call with focused prompt (`agent/persist.ts`) → outputs structured JSON
2. `extractJson()` defensively extracts JSON from potentially messy LLM output
3. Zod schema validates the output
4. Deterministic code writes to DB — the LLM decides WHAT, code decides HOW
5. Yields section_updated/data_updated SSE events for UI refresh

**CONVERSE tools** (read-only): `read_section`, `query_teaching_moments`, `query_case_studies` + ORR-only: `search_code`, `read_file`, `list_directory`

**PERSIST writes** (via structured JSON, not tool calls): question_responses, section_content, depth_assessments, flags, dependencies, discoveries, experiments, action_items, cross_practice, timeline_events, contributing_factors

**Legacy fallback**: Set `AGENT_LOOP_VERSION=v1` in `.env` to use the old unstructured loop with all tools.

**Steering hooks** (`agent/hooks/`): Security hooks block sensitive file access (`.env`, `.pem`, SSH keys) and redact credentials from tool results. Content scan hooks enforce size limits (10KB per result, 20 search matches).

**Agent profiles** (6 defined, 2 implemented): REVIEW_FACILITATOR, INCIDENT_LEARNING_FACILITATOR (both active); SESSION_ASSISTANT, TRANSCRIPT_PROCESSOR, DRIFT_ANALYST, PREP_BRIEF_GENERATOR (planned).

**Engagement detection** (`agent/engagement.ts`): Heuristic function that runs every turn on conversation history. Detects frustration (hedging, terse responses, wall-hit patterns) and fluency illusion (overconfident long answers at shallow depth). Injects adaptive guidance into the system prompt.

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
LLM_API_KEY=                       # Anthropic (sk-ant-*) or OpenAI-compatible; not needed for Bedrock
LLM_MODEL=                         # Shortnames: sonnet, opus, haiku; or full model ID
LLM_PROVIDER=                      # Optional: bedrock (auto-detected from key if not set)
LLM_BASE_URL=                      # Optional, for OpenAI-compatible endpoints
AWS_REGION=                        # Optional, for Bedrock (defaults to us-east-1)
TRUST_PROXY_AUTH=                  # Set to "true" behind a reverse proxy with auth headers
PORT=3000
```
