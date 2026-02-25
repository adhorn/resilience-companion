# Resilience Companion

A self-hosted web tool for facilitating resilience practices — Operational Readiness Reviews, incident analysis, and more. Built as a companion to the book *[Why We Still Suck at Resilience](https://leanpub.com/whywestillsuckatresilience)* by Adrian Hornsby.

Reviews are conversations, not checklists. This tool treats each practice as a learning experience: an AI facilitator guides your team through structured questions, probes for depth, surfaces relevant industry incidents, and flags risks — while the team retains full ownership of the document.

## What this tool is an argument for

The book argues that most resilience practices degrade into checklists, theater, and compliance exercises because the organizations running them optimize for **performance over learning**. The Resilience Companion is a working argument that it doesn't have to be that way: you can build a tool that deliberately resists turning into a checklist, that treats productive struggle as the point rather than an obstacle to smooth UX, and that measures itself on whether teams *learn*, not on whether forms get filled in.

If you disagree with that framing, this is probably the wrong tool for you — and that's fine. The book makes the case in full; this repo is what the case looks like in code.

Related reading in this repo: [`docs/HOW-LEARNING-WORKS.md`](docs/HOW-LEARNING-WORKS.md) walks through how a single user message becomes a persisted learning signal.

## What this tool is *not*

To set expectations correctly before you deploy it:

- **Not a SaaS product.** There is no hosted version, no signup, no support contract. You run it on your own infrastructure for your own team.
- **Not multi-tenant.** The auth model, rate limiting, and data isolation are designed for one trusted team, not a public service. Do not expose this on the public internet without additional hardening you will have to build yourself.
- **Not a compliance tool.** It does not produce auditor-ready artifacts. It produces learning, and a by-product of that learning is a document you can export. These are not the same thing.
- **Not a replacement for human facilitation.** The AI facilitator is a scaffolding for self-serve reviews when you can't get a senior SRE in the room. A skilled human facilitator will always be better. This tool is for when that isn't available.
- **Not stable.** The architecture is in active flux. Breaking changes are likely. Pin a commit if you need stability.

## Threat model & intended deployment

This tool is designed to run **on a trusted internal network, for a single team, behind your existing authentication perimeter**. That shapes every security decision in the codebase.

- **Trusted users**: Anyone who can reach the API can see the team's data. Auth is present but coarse.
- **LLM data exposure**: Review content, section prompts, and code snippets are sent to whichever LLM provider you configure. Do not paste secrets into reviews. Do not connect git repositories containing credentials.
- **Encrypted PATs**: Git personal access tokens are encrypted at rest, but the key lives on the same machine as the database. Treat the whole data directory as sensitive.
- **Not hardened against**: public internet exposure, hostile insiders, multi-tenant isolation, DoS, prompt injection from ingested external content (e.g., public postmortems). If your threat model includes any of these, do not deploy this tool as-is.

If you deploy this somewhere it wasn't designed for and something goes wrong, that's on you. File an issue if you want to discuss hardening for a specific environment.

## What It Does

**AI-Facilitated Reviews** — An AI agent acts as a curious, Socratic facilitator. It asks questions from a structured template, follows up when answers are shallow, and connects your team's responses to real-world failure patterns. Think of it as a knowledgeable colleague who's read every post-mortem and knows exactly which follow-up question to ask.

**Two Practices, One Learning System** — ORRs assess operational readiness *before* incidents happen. Incident analysis extracts learning *after* they happen. Both practices share the same agent architecture, teaching moment library, and flag system — so insights from one practice naturally inform the other.

**Document-First Architecture** — The review document is the durable artifact. Conversations are ephemeral. The agent writes observations, depth assessments, and flags directly into the document so the value persists after the session ends.

**Teaching Moment Library** — A curated collection of industry incidents and failure patterns (seeded from public post-mortems). The agent surfaces relevant teaching moments during reviews — "This reminds me of the 2017 S3 outage..." — turning each review into a learning opportunity.

**Organizational Risk Visibility** — A flags view aggregates risks, gaps, and follow-ups across all your team's reviews. See which risks are overdue, which sections have gaps, and where your blind spots are.

## Quick Start (Docker)

```bash
git clone <repo-url>
cd resilience-companion
cp .env.example .env     # edit LLM_API_KEY with your Anthropic or OpenAI key
docker compose up
```

Open http://localhost:3080. That's it.

Docker defaults to port **3080** (not 3000) so it never conflicts with `npm run dev`. To use a different port: `DOCKER_PORT=4000 docker compose up`.

The database is auto-created on first boot and persisted in `./data/`. To reset, stop the container and delete `./data/resilience-companion.db`.

## Quick Start (Local Development)

**Prerequisites:** Node.js 22+

```bash
git clone <repo-url>
cd resilience-companion
npm install
cp .env.example .env     # edit LLM_API_KEY
npm run dev              # API on :3000, web dev server on :5173
```

Open http://localhost:5173 (hot-reloading frontend) or http://localhost:3000 (API-served static build).

### Build for Production

```bash
npm run build            # shared → api → web (web assets copied to api/public/)
npm start -w @orr/api    # serves everything on port 3000
```

## The Two Practices

### Operational Readiness Reviews (ORRs)

The default ORR template is extracted from the book's appendix — **121 prompts across 11 sections**:

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

#### Feature ORRs (Lightweight Change Reviews)

Not every change needs a full 11-section review. Feature ORRs are lightweight, change-scoped reviews for teams that already have a Service ORR. When creating an ORR, choose between:

- **Service ORR** — Full operational readiness review (11 sections, 121 prompts). Best for new services or periodic re-reviews.
- **Feature ORR** — Tailored to specific changes (typically 2-4 sections, 15-30 prompts). Best for adding dependencies, new endpoints, schema migrations, scaling changes, or security boundary shifts.

Feature ORRs generate questions from three sources:
1. **Impact questions** — "Does this change affect what the service ORR established?" (architecture, failures, monitoring, deployment, operations, DR)
2. **Readiness questions** — Per change type: dependency readiness, endpoint readiness, data model readiness, etc.
3. **Universal questions** — Always included: rollback plan, validation strategy, monitoring confidence, blind spots, communication

The creation wizard lets you select change types, describe the change, optionally link to a parent Service ORR, and review/customize the generated questions before creating.

When linked to a parent ORR, the AI agent receives the parent's section summaries as context and can check your change against what was previously established.

### Incident Analysis

A learning-focused post-incident analysis template — **99 prompts across 14 sections**:

1. **Incident Details** — When, where, duration, who was involved
2. **Owner & Review Committee** — Analysis ownership and review participants
3. **Classification** — Severity, type, affected services
4. **Executive Summary** — What happened, in plain language
5. **Supporting Data** — Metrics, graphs, logs, evidence
6. **Customer Impact** — Who was affected and how
7. **Incident Response Analysis** — How the team detected, coordinated, and resolved
8. **Post-Incident Analysis** — Root causes, systemic factors, what was missed
9. **Timeline** — Structured event recording with timestamps and actors
10. **Contributing Factors Analysis** — Technical, process, organizational, human factors, communication, knowledge gaps
11. **Surprises & Learning** — WAI vs WAD gaps, mental model updates, what worked well
12. **Action Items** — Tracked with owner, priority, due date, and success criteria
13. **Learning Loops & Knowledge Sharing** — Connections to chaos experiments, load testing, ORRs, GameDays
14. **Quality Checklist** — Self-assessment of analysis completeness

The incident agent has additional tools beyond the shared set: `record_timeline_event`, `record_contributing_factor`, `record_action_item`, `suggest_experiment`, and `suggest_cross_practice_action`.

## How a Review Session Works

1. Create an ORR or incident for your service
2. Start an AI session — the agent introduces itself and begins with the active section
3. Your team answers questions conversationally. The agent:
   - Records answers against specific template prompts
   - Probes shallow answers ("You mentioned failover — have you actually tested it?")
   - Searches your source code when asked (ORRs with connected git repos)
   - Surfaces relevant teaching moments from the library
   - Assesses depth: **Surface** → **Moderate** → **Deep**
   - Flags risks, gaps, strengths, and follow-up items
4. End the session. The agent writes a summary. The document is versioned.
5. Export to Markdown for sharing.

Sessions auto-renew at 200k tokens with conversation carryover and automatic summary preservation.

### Slash Commands

Type `/` in the chat to access quick actions. Each practice has its own set:

**ORR commands:**

| Command | What it does |
|---------|-------------|
| `/dependencies` | Map all dependencies mentioned across sections |
| `/summarize` | Summarize review progress, depth, and key findings |
| `/depth` | Get an honest depth assessment of the current section |
| `/incidents` | Find real-world incidents relevant to your architecture |
| `/status` | Overview of all sections: depth, coverage, flags |
| `/risks` | List all risks and gaps, grouped by severity |
| `/experiments` | Suggest chaos experiments, load tests, or gamedays |
| `/learning` | Extract learning signals from all sections |

**Incident analysis commands:**

| Command | What it does |
|---------|-------------|
| `/timeline` | Build the incident timeline from discussion so far |
| `/factors` | Identify and record contributing factors |
| `/actions` | Generate action items linked to contributing factors |
| `/summarize` | Summarize analysis progress and gaps |
| `/depth` | Assess analysis depth of the current section |
| `/patterns` | Search for systemic patterns and related incidents |
| `/experiments` | Suggest chaos experiments or load tests to prevent recurrence |

## LLM Provider Support

The tool auto-detects your provider from the API key:

- **Anthropic** (`sk-ant-*`) — Native SDK. Shortnames: `sonnet`, `opus`, `haiku`
- **Amazon Bedrock** (`LLM_PROVIDER=bedrock`) — Uses AWS credential chain, no API key needed. Same shortnames map to Bedrock model IDs.
- **OpenAI-compatible** (any other key) — Works with OpenAI, Azure, Ollama, or any compatible endpoint via `LLM_BASE_URL`
- **No key** — The tool works without AI as a structured review template. Dashboard, export, and flag tracking still function.

All LLM calls go through a retry adapter with exponential backoff, transient error detection, and optional fallback model switching.

## Code Exploration (ORRs)

When you connect a git repository to an ORR (via URL + optional PAT for private repos), the AI agent gains three additional tools:

- **search_code** — Grep the repo for patterns, function names, or keywords
- **read_file** — Read source files with line ranges
- **list_directory** — Browse the repo structure

The agent only uses these when the team explicitly asks ("Can you check how we handle timeouts?").

## Environment Variables

See [`.env.example`](.env.example) for all options. The key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_API_KEY` | No | Anthropic (`sk-ant-*`) or OpenAI-compatible key. Without it, the tool works as a structured review without AI. |
| `LLM_MODEL` | No | Model shortname (`sonnet`, `opus`, `haiku`) or full model ID. |
| `LLM_PROVIDER` | No | Set to `bedrock` for Amazon Bedrock. Auto-detected from API key if not set. |
| `LLM_BASE_URL` | No | Custom endpoint for OpenAI-compatible providers (Azure, Ollama, etc.) |
| `TRUST_PROXY_AUTH` | No | Set to `true` to trust `X-Forwarded-Email` headers from a reverse proxy. |
| `DB_PATH` | No | SQLite database path. Defaults to `./data/resilience-companion.db`. |
| `PORT` | No | Server port. Defaults to `3000`. |

## Architecture

TypeScript monorepo with three npm workspaces:

```
resilience-companion/
├── packages/
│   ├── shared/              # @orr/shared — types, constants, templates (built first)
│   ├── api/                 # @orr/api — Hono server, SQLite, agent system, LLM adapters
│   │   └── src/
│   │       ├── agent/       # Agent loop, system prompt, tools, context, trace, steering
│   │       ├── db/          # Schema, migrations, seed data (Drizzle ORM + better-sqlite3)
│   │       ├── llm/         # Provider adapters (Anthropic, OpenAI, NoOp) + retry
│   │       ├── practices/   # Practice-specific config, tools, prompts, hooks
│   │       │   ├── orr/     # ORR practice implementation
│   │       │   ├── incident/# Incident analysis practice implementation
│   │       │   └── shared/  # Shared session routes, tool definitions
│   │       └── routes/      # REST endpoints
│   └── web/                 # @orr/web — React 19 + Vite + TailwindCSS + React Query
│       └── src/
│           ├── pages/       # Dashboard, ORRView, IncidentView, Flags, Learn
│           ├── api/         # Fetch-based API client with SSE streaming
│           └── components/  # Layout, shared UI
├── Dockerfile               # Multi-stage build for production
├── docker-compose.yml       # One-command deployment
└── .env.example             # Configuration template
```

### How the Agent System Works

For a detailed walkthrough of how learning signals are captured — from message to persistence — see **[How Learning Works: The Life of a Message](docs/HOW-LEARNING-WORKS.md)**.

Both practices share one agent loop (`agent/loop.ts`) with practice-specific configuration plugged in:

```
User message → Practice Config → Agent Loop → LLM + Tools → SSE stream → Frontend
                    │
                    ├── buildContext()       # What the agent sees
                    ├── buildSystemPrompt()  # Who the agent is
                    ├── tools[]              # What the agent can do
                    └── executeTool()        # How tool calls are handled
```

**Steering hooks** add deterministic guardrails on top of the LLM:
- *Security hooks* (always active): block access to sensitive files, redact credentials from code search results
- *Quality hooks* (tier-gated): enforce read-before-write patterns, validate assessment depth

**Observability**: Every agent turn emits structured trace spans (W3C-compatible) with token usage, tool call timings, retry counts, and errors — ready for any log aggregator.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 + TypeScript |
| API | Hono |
| Database | SQLite (Drizzle ORM + better-sqlite3) |
| Frontend | React 19 + Vite + TailwindCSS + React Query |
| AI | Anthropic Claude or any OpenAI-compatible provider |
| Streaming | Server-Sent Events (SSE) |

## API Endpoints

### ORRs

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/v1/orrs` | List / create ORRs |
| GET/PATCH/DELETE | `/api/v1/orrs/:id` | Get / update / delete ORR |
| GET/PATCH | `/api/v1/orrs/:orrId/sections` | List / update sections |
| POST | `/api/v1/orrs/:orrId/sessions` | Start AI session |
| POST | `/api/v1/orrs/:orrId/sessions/:id/messages` | Send message (SSE stream) |
| POST | `/api/v1/orrs/:orrId/sessions/:id/end` | End session |
| GET | `/api/v1/orrs/:orrId/export/markdown` | Export as Markdown |

### Incidents

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/v1/incidents` | List / create incidents |
| GET/PATCH/DELETE | `/api/v1/incidents/:id` | Get / update / delete incident |
| GET/PATCH | `/api/v1/incidents/:incidentId/sections` | List / update sections |
| POST | `/api/v1/incidents/:incidentId/sessions` | Start AI session |
| POST | `/api/v1/incidents/:incidentId/sessions/:id/messages` | Send message (SSE stream) |
| POST | `/api/v1/incidents/:incidentId/sessions/:id/end` | End session |
| GET | `/api/v1/incidents/:incidentId/export/markdown` | Export as Markdown |

### Cross-Practice

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/services` | List services with linked ORRs, incidents, experiments |
| GET | `/api/v1/experiments` | List experiment suggestions (filter by practice) |
| PATCH | `/api/v1/experiments/:id` | Update experiment status (accepted, completed, dismissed) |
| GET | `/api/v1/insights` | Discoveries, action items, cross-practice suggestions |
| GET | `/api/v1/orrs/:id/learning` | Per-section learning signals for an ORR |
| GET | `/api/v1/incidents/:id/learning` | Per-section learning signals for an incident |

### Shared

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/v1/dashboard` | Aggregated stats |
| GET | `/api/v1/flags` | Flags across all practices |
| GET | `/api/v1/templates` | List templates |
| GET | `/api/v1/teaching-moments` | Browse teaching moments |
| GET | `/api/v1/case-studies` | Browse case studies |
| POST/GET/DELETE | `/api/v1/tokens` | PAT management (create, list, revoke) |

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

**Steering Tiers** — Three levels of agent guardrails:
- **Standard**: Security hooks only
- **Thorough** (default): + read-before-write enforcement
- **Rigorous**: + parameter validation on assessments

**Session Budget** — Sessions auto-renew at 200k tokens. At 75% usage the agent gets a warning to start wrapping up; at 90% it's urged to write a summary. Before auto-renewal, a dedicated flush call ensures the session summary is preserved even if the agent didn't heed the warnings.

## Current Status

This is a Phase 1 MVP designed for local, single-team use.

**What works today:**
- ORR reviews with AI facilitation (11 sections, 121 prompts)
- Feature ORRs — lightweight change-scoped reviews with tailored question generation
- Incident analysis with AI facilitation (14 sections, 99 prompts)
- Incident timeline, contributing factors, and action item tracking
- Cross-practice experiment suggestions
- Depth assessment and flag management
- Teaching moment and case study library (seeded with public incidents)
- Git repository integration for code exploration during ORR reviews
- Dashboard with staleness tracking and organizational flag visibility
- Markdown export for both practices
- Session auto-renewal with pre-compaction flush
- Steering hooks for agent quality and security
- LLM retry with exponential backoff and fallback model support
- Structured trace logging (W3C-compatible spans)
- Docker packaging for easy deployment

**What's planned:**
- Expert-led facilitation mode (Mode 1) and hybrid async prep (Mode 3)
- Transcript import from recorded meetings
- OIDC/SSO authentication
- Drift detection across ORR versions
- Unified learning dashboard across practices

## Troubleshooting

### `bind: address already in use` when running Docker

Docker defaults to port 3080 to avoid conflicts with `npm run dev` (port 3000). If 3080 is also taken:

```bash
DOCKER_PORT=4000 docker compose up
```

### `npm run dev` won't start (port 3000 in use)

A Docker container may be running on port 3000 from an older config:

```bash
docker compose down
npm run dev
```

### Port not released after stopping the dev server

Sometimes `Ctrl+C` doesn't fully kill all child processes, leaving a ghost Node process holding the port. This can happen when signal propagation fails in the `concurrently` → `tsx watch` → `node` chain.

**Diagnose** — check what's holding the port:

```bash
lsof -iTCP:3000 -sTCP:LISTEN
```

**Fix** — kill the process using the port:

```bash
kill $(lsof -iTCP:3000 -sTCP:LISTEN -t)
```

**Verify** — confirm the port is free (should return nothing):

```bash
lsof -iTCP:3000 -sTCP:LISTEN
```

If this happens frequently, the dev script already includes mitigations (direct `tsx` invocation instead of `npm run`, `--kill-others --kill-signal SIGTERM` in concurrently, and graceful shutdown handlers in the API server). If ghost processes persist, you can also try `kill -9` instead of `kill`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: this is a companion to a book, maintained by one person, with a specific philosophical framing. Issues welcome, PRs on a case-by-case basis, no SLA. Read the book before proposing feature work — a surprising amount of what looks like a missing feature is deliberate.

## License

[Apache License 2.0](LICENSE).
