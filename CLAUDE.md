# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Resilience Companion is a web application for facilitating resilience practices (ORRs, incident analysis, and more), built as a companion tool to the book "Why We Still Suck at Resilience." An AI agent guides teams through structured reviews via Socratic conversation, persisting observations into a document-first data model.

**Current state**: Phase 1 MVP — Review Facilitator agent (AI-assisted self-serve reviews), teaching moment library, portal, dashboard, markdown export. See `docs/SPEC.md` for full roadmap.

**Key design principle**: Document-first. The ORR document is the durable artifact; conversations are ephemeral. The agent writes observations back to sections via tools.

## Commands

```bash
npm run dev          # Start API (port 3000) + Web (port 5173) concurrently
npm run build        # Build all packages in order: shared → api → web
npm test             # Vitest (no tests written yet)
npm run lint         # TypeScript type-check (--noEmit) for api + web
```

Per-workspace: `npm run dev -w @orr/shared`, `npm run dev -w @orr/api`, `npm run dev -w @orr/web`

## Architecture

TypeScript monorepo, three npm workspaces. SQLite database.

### `packages/shared` (@orr/shared)
Pure TypeScript types and constants — no runtime code. **Must be built first.**
- `types.ts` — All entity types and API DTOs
- `constants.ts` — Enums (status, depth, flags, roles, agent profiles, staleness thresholds)
- `template/default-template.ts` — 11-section ORR template with 107 prompts from the book's appendix

### `packages/api` (@orr/api)
Hono web framework + SQLite (Drizzle ORM + better-sqlite3).

**Boot sequence**: `src/index.ts` → `initDb()` (auto-migrate + seed) → Hono server on port 3000.

**Routes** — each file creates `new Hono()`, applies `requireAuth`, mounts at `/api/v1/{resource}`:
- `orrs.ts` — ORR CRUD
- `sections.ts` — Section content and prompt responses
- `sessions.ts` — Session lifecycle + SSE message streaming (agent loop entry point)
- `teaching-moments.ts`, `case-studies.ts` — Library browsing
- `templates.ts`, `dashboard.ts`, `export.ts`

**Auth**: MVP stub — middleware injects first user from DB. JWT (jose) ready for Phase 2 OIDC. All queries scoped by `user.teamId`.

**Database**: Schema in `src/db/schema.ts`. Pragmas: WAL mode, foreign keys ON, 5s busy timeout. `createTestDb()` available for in-memory test DBs.

Key tables: `orrs`, `sections` (11 per ORR), `sessions`, `sessionMessages`, `teachingMoments`, `caseStudies`, `orrVersions` (full snapshots on session end).

Design decisions: sections store prompts/promptResponses as JSON, teaching moments link by tag (not FK), ORR versions are full snapshots (not incremental), last-writer-wins concurrency.

### `packages/web` (@orr/web)
React 19 + Vite + TailwindCSS + React Query.

**Routes** (React Router v7):
- `/dashboard` — Stats, staleness, coverage, recent activity
- `/orrs` — Team's ORRs list
- `/orrs/new` — Create ORR (select service + template)
- `/orrs/:id` — Full-screen split-pane: section nav + prompts/conversation with AI
- `/learn` — Browse teaching moments and case studies

**API client** (`src/api/client.ts`): Pure fetch, resource-based (`api.orrs.list()`, etc.). SSE for agent messages via native ReadableStream.

In production, built web assets are copied to `packages/api/public/` and served by Hono with SPA fallback.

## Agent System

POST `/api/v1/orrs/:orrId/sessions/:sessionId/messages` → `runAgent()` in `agent/loop.ts`:
1. Build context (`agent/context.ts`) — active section in full, others as summaries, session history, relevant teaching moments
2. Build system prompt (`agent/system-prompt.ts`) — Review Facilitator persona: curious, Socratic, probes depth
3. Call LLM with conversation + tools, max 5 iterations per turn
4. Execute tool calls, yield SSE events (`message_start`, `content_delta`, `tool_call`, `tool_result`, `section_updated`, `message_end`)

**8 tools** (`agent/tools.ts`): `read_section`, `update_section_content`, `update_depth_assessment`, `set_flags`, `query_teaching_moments`, `query_case_studies`, `update_question_response`, `write_session_summary`

**Agent profiles** (only Review Facilitator implemented for MVP): Review Facilitator, Session Assistant, Transcript Processor, Drift Analyst, Prep Brief Generator.

## LLM Integration

Pluggable adapter pattern in `src/llm/`. `getLLM()` singleton auto-detects provider from `LLM_API_KEY`:
- `sk-ant-*` → `AnthropicAdapter` (native SDK, shortnames: `sonnet` → `claude-sonnet-4-20250514`)
- Other keys → `OpenAICompatibleAdapter` (OpenAI, Azure, Ollama via `LLM_BASE_URL`)
- No key → `NoOpAdapter` (app works without LLM as a structured review tool)

## Environment Variables

```
DB_PATH=./data/resilience-companion.db   # Relative to monorepo root
JWT_SECRET=change-me-in-production
LLM_API_KEY=                       # Anthropic (sk-ant-*) or OpenAI-compatible
LLM_MODEL=                         # Default: claude-sonnet for Anthropic, gpt-4o for OpenAI
LLM_BASE_URL=                      # Optional, for OpenAI-compatible endpoints
PORT=3000
```
