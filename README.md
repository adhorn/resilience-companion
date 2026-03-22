# Resilience Companion

A self-hosted web tool for facilitating resilience practices — Operational Readiness Reviews, incident analysis, and more. Built as a companion to the book *[Why We Still Suck at Resilience](https://leanpub.com/whywestillsuckatresilience)* by Adrian Hornsby.

ORRs are conversations, not checklists. This tool treats the review as a learning experience: an AI facilitator guides your team through structured questions, probes for depth, surfaces relevant industry incidents, and flags risks — while the team retains full ownership of the document.

## What It Does

**AI-Facilitated Reviews** — An AI agent acts as a curious, Socratic facilitator. It asks questions from a structured template, follows up when answers are shallow, and connects your team's responses to real-world failure patterns. Think of it as a knowledgeable colleague who's read every post-mortem and knows exactly which follow-up question to ask.

**Document-First Architecture** — The ORR document is the durable artifact. Conversations are ephemeral. The agent writes observations, depth assessments, and flags directly into the review document so the value persists after the session ends.

**Teaching Moment Library** — A curated collection of industry incidents and failure patterns (seeded from public post-mortems). The agent surfaces relevant teaching moments during reviews — "This reminds me of the 2017 S3 outage..." — turning each review into a learning opportunity.

**Organizational Risk Visibility** — A flags view aggregates risks, gaps, and follow-ups across all your team's ORRs. See which risks are overdue, which sections have gaps, and where your blind spots are.

## The 11-Section ORR Template

The default template is extracted from the book's appendix — 107 prompts across 11 sections:

1. **Service Definition and Goals** — What does this service do, who depends on it, what are the SLAs?
2. **Architecture** — Components, scaling behavior, blast radius, single points of failure
3. **Failures, Impact & Adaptive Capacity** — Failure modes, graceful degradation, untested assumptions
4. **Risk Assessment** — What worries you? What was cut? What might surprise you?
5. **Learning & Adaptation** — Near-miss learning, cross-team sharing, mental model revision
6. **Monitoring, Metrics & Alarms** — Alarm coverage, dashboard gaps, drift detection signals
7. **Testing & Experimentation** — Chaos experiments, dependency testing, GameDay plans
8. **Deployment** — Pipeline walkthrough, rollback experience, config validation
9. **Operations & Adaptive Capacity** — On-call rotation, runbook freshness, decision-making under ambiguity
10. **Disaster Recovery** — DR exercises, backup restoration, operational levers
11. **Organizational Learning** — Blameless reviews, design decision capture, lessons-to-action tracking

Teams can customize sections and prompts per ORR.

## How a Review Session Works

1. Create an ORR for your service (optionally connect a git repository)
2. Start an AI session — the agent introduces itself and begins with the active section
3. Your team answers questions conversationally. The agent:
   - Records answers against specific prompts
   - Probes shallow answers ("You mentioned failover — have you actually tested it?")
   - Searches your source code when asked ("Can you find how retries are configured?")
   - Surfaces relevant teaching moments from the library
   - Assesses depth: **Surface** (reciting docs), **Moderate** (explaining reasoning), **Deep** (predicting novel failures)
   - Flags risks, gaps, strengths, and follow-up items
4. End the session. The agent writes a summary. The document is versioned.
5. Export to Markdown for sharing.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 + TypeScript |
| API | Hono |
| Database | SQLite (Drizzle ORM + better-sqlite3) |
| Frontend | React 19 + Vite + TailwindCSS + React Query |
| AI | Anthropic Claude or any OpenAI-compatible provider |
| Streaming | Server-Sent Events (SSE) |

Monorepo with three npm workspaces: `@orr/shared` (types/constants), `@orr/api` (server + agent), `@orr/web` (React SPA).

## Getting Started

### Prerequisites

- Node.js 22+
- An LLM API key (Anthropic or OpenAI-compatible) — optional, the tool works as a structured review without AI

### Setup

```bash
git clone <repo-url>
cd orr-companion
npm install
```

Create a `.env` file in the project root:

```env
DB_PATH=./data/orr-companion.db
JWT_SECRET=change-me-in-production

# Anthropic (recommended)
LLM_API_KEY=sk-ant-...
LLM_MODEL=sonnet            # or opus, haiku

# Or OpenAI-compatible
# LLM_API_KEY=sk-...
# LLM_MODEL=gpt-4o
# LLM_BASE_URL=https://api.openai.com/v1   # optional, for custom endpoints
```

### Run

```bash
npm run dev
```

This starts both the API (port 3000) and the web dev server (port 5173). Open http://localhost:5173.

### Build for Production

```bash
npm run build
npm start -w @orr/api
```

The web app builds into `packages/api/public/` and is served by the API server at port 3000.

## LLM Provider Support

The tool auto-detects your provider from the API key:

- **Anthropic** (`sk-ant-*`) — Native SDK. Shortnames: `sonnet`, `opus`, `haiku`, `sonnet-4.6`, `opus-4.6`, `haiku-4.5`
- **OpenAI-compatible** (any other key) — Works with OpenAI, Azure, Ollama, or any compatible endpoint via `LLM_BASE_URL`
- **No key** — The tool works without AI as a structured review template. Dashboard, export, and flag tracking still function.

## Code Exploration

When you connect a git repository to an ORR (via URL + optional PAT for private repos), the AI agent gains three additional tools:

- **search_code** — Grep the repo for patterns, function names, or keywords
- **read_file** — Read source files with line ranges
- **list_directory** — Browse the repo structure

The agent only uses these when the team explicitly asks ("Can you check how we handle timeouts?"). It never proactively reads code without being asked.

## Key Concepts

**Depth Assessment** — The agent evaluates how deeply the team understands each section:
- **Surface**: Team recites what exists but can't explain why or predict beyond documented failures
- **Moderate**: Team retrieves specifics, traces paths, explains some design reasoning
- **Deep**: Team generates predictions docs don't cover, explains why designs work, identifies own blind spots

**Flags** — The agent raises flags during reviews:
- **RISK** (with severity + deadline): Active risks that need mitigation
- **GAP**: Missing capabilities or untested areas
- **STRENGTH**: Things the team does well worth preserving
- **FOLLOW_UP**: Items to revisit later

**Session Management** — Sessions auto-renew at 200k tokens with conversation carryover. Each session end creates a versioned snapshot of the ORR document.

## Project Structure

```
orr-companion/
  packages/
    shared/          # Types, constants, ORR template (built first)
    api/             # Hono server, SQLite, agent system, LLM adapters
      src/
        agent/       # System prompt, tools, loop, context builder
        db/          # Schema, migrations, seed data
        llm/         # Provider adapters (Anthropic, OpenAI, NoOp)
        routes/      # REST endpoints
    web/             # React SPA
      src/
        pages/       # Dashboard, ORRView, Flags, Learn, NewORR
        api/         # Fetch-based API client
        components/  # Layout, shared UI
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET/POST | `/api/v1/orrs` | List / create ORRs |
| GET/PATCH/DELETE | `/api/v1/orrs/:id` | Get / update / delete ORR |
| GET/PATCH | `/api/v1/orrs/:orrId/sections` | List / update sections |
| POST | `/api/v1/orrs/:orrId/sessions` | Start AI session |
| POST | `/api/v1/orrs/:orrId/sessions/:id/messages` | Send message (SSE stream) |
| POST | `/api/v1/orrs/:orrId/sessions/:id/end` | End session |
| GET | `/api/v1/orrs/:orrId/export/markdown` | Export ORR as Markdown |
| GET | `/api/v1/dashboard` | Aggregated stats |
| GET | `/api/v1/flags` | Flags across all ORRs |
| GET | `/api/v1/templates` | List templates |
| GET | `/api/v1/teaching-moments` | Browse teaching moments |
| GET | `/api/v1/case-studies` | Browse case studies |

## Current Status

This is a Phase 1 MVP. The AI-assisted self-serve review mode is functional. The tool is designed for local, single-team use.

**What works today:**
- Create and work through ORRs with AI facilitation
- Depth assessment and flag management
- Teaching moment and case study library (seeded with public incidents)
- Dashboard with staleness tracking and organizational flag visibility
- Git repository integration for code exploration during reviews
- Markdown export
- Session auto-renewal with conversation continuity
- Tool call audit trail for debugging

**What's planned:**
- Expert-led facilitation mode (Mode 1) and hybrid async prep (Mode 3)
- Transcript import from recorded meetings
- OIDC/SSO authentication
- Drift detection across ORR versions
- MCP server integration
- Cross-practice connections (load testing, chaos engineering, incident analysis)

## License

Part of the companion materials for *Why We Still Suck at Resilience*. See book for terms.
