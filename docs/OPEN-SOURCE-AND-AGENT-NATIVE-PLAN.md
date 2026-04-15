# Open-Source & Agent-Native Readiness Plan

**Status**: Draft — for review
**Date**: 2026-04-09
**Scope**: Two intertwined goals: (1) get the Resilience Companion to a state where it can be open-sourced without embarrassment or regret, and (2) make it pass the "Liz Fong-Jones test" — an external agent can do real work against it without manual intermediation.

These are treated together because they share the same load-bearing prerequisite: **real auth with revocable, scoped tokens**. Once that's in place, both goals unlock.

---

## Guiding principles

1. **The UI is a demo surface, not the product.** The primitives are the product. The API already covers every core entity (18 route modules). This plan protects and exposes that surface, it doesn't rebuild it.
2. **Earn complexity.** Nothing gets built unless there's evidence the previous step landed. No speculative multi-phase architecture.
3. **Honesty in the README.** Whatever the tool isn't ready for, say so. Liz's critique lands hardest on vendors who overclaim; we avoid it by underclaiming.
4. **One breaking change window.** Between now and v0.1 open-source tag, breaking changes are free. After the tag, they cost. Batch them now.

---

## Prerequisites (shared by both tracks)

### P1. PATs + proxy-ready auth (blocks everything)

Current state: Stub middleware injects the first user from DB. No login, no tokens, no identity. The web UI just works on a trusted network — and that's fine for the threat model.

**What we're building**:

1. **Personal Access Tokens (PATs)** for programmatic clients (Slack bot, MCP, scripts). Each token:
   - Belongs to a user, inherits that user's team scope
   - Has an optional expiration (default: 90 days)
   - Stored hashed (argon2 or bcrypt), last-used timestamp updated on use
   - Revocable from a settings page in the web UI
2. **Settings page** in the web UI to create, list, and revoke PATs. One-time setup — copy the token into `docker-compose.yml` (Slack) or `.mcp.json` (MCP/Skills) and forget about it.
3. **Proxy auth headers** — trust `X-Forwarded-User` / `X-Forwarded-Email` when sent by a configured reverse proxy. Auto-create users from headers on first request. This is how enterprises get SSO without us building SSO: they put OAuth2 Proxy, Authelia, or Pomerium in front, the proxy handles OIDC/SAML, and we trust the headers. ~20 lines of middleware.

**What we're NOT building**: Login page, password management, OAuth flows, SAML, session management for the web UI. The stub stays for direct access on trusted networks. The proxy handles identity for enterprises.

**Auth middleware priority chain**: proxy headers (if configured) → PAT (`Authorization: Bearer <pat>`) → stub (first user fallback, for backward compat on trusted networks).

**Why this is the blocker**: Slack bot, MCP server, and going public all need PATs. Without them, programmatic clients can't authenticate.

**Scope**: ~300–400 lines. New `api_tokens` table, token CRUD endpoints, middleware extension, settings page in web UI, proxy header support.

### P2. Postgres migration (blocks multi-team, enables knowledge graph)

Current state: SQLite (better-sqlite3). Fine for single-team dev, but the Companion is intended for multi-team org-wide deployment with a shared database.

**What we're building**:
- Drizzle dialect swap: SQLite → Postgres (node-postgres / drizzle-orm/pg-core). Schema is the same, migration is mechanical.
- `docker-compose.yml` with Postgres container for production. **Postgres only runs in containers — no native install, no homebrew.**
- SQLite stays for local dev: if `DATABASE_URL` is set → Postgres; otherwise → SQLite. Zero-config `npm run dev` still works.
- `docker compose up db` starts just Postgres for devs who want to test against it locally.
- Migration scripts (Drizzle Kit handles this)

**Why this is a prerequisite**:
- Multiple teams sharing one database = concurrent writes, connection pooling, proper transactions. SQLite can't do that.
- Unlocks Apache AGE (graph extension) for contextual recall — see `CONTEXTUAL-RECALL-PLAN.md`
- Production deployments need a real database. No enterprise customer will use SQLite.

**What we're NOT building**: Multi-tenancy isolation, row-level security, database-per-team. Team scoping via `teamId` column (existing pattern) is sufficient.

**Scope**: ~1-2 days. Drizzle abstracts the dialect. The hard part is testing the migration path, not writing it.

### P3. Security pass

Items already noted in `security-priorities.md`. Before opening the repo:
- Audit where secrets can end up in logs (especially LLM request bodies with team data)
- Confirm encrypted PATs for git repos are actually encrypted, key rotation documented
- Rate limiting on auth endpoints
- Input validation audit on any field that flows into LLM prompts (prompt injection surface)
- `docker compose up` defaults must be safe: no dev keys, no `0.0.0.0` binding, no default admin

**Out of scope**: hardening for public internet exposure — the README already says don't do that.

### P4. License decision

Pick one and commit it. This is a one-way door; make it now so A4/A5 don't have to revisit.

Recommendation: **MIT**. Simplest, universally understood, zero friction. The book is the moat, not the license — wide adoption of the tool serves the book. Comparable projects in the resilience space: unlost (MIT), rebound (Apache-2.0), fault-cli (Apache-2.0). All chose permissive licenses. Apache-2.0's patent grant is the only real upgrade over MIT, but for a solo book companion that's theoretical. MIT is the right default.

---

## Track A: Open-source readiness

Ordered. Don't skip ahead.

### A1. Repo hygiene
- Remove any dev databases, log files, local clones from the tree (currently `orr-companion.db`, `data/`, `logs/`, `repos/` — verify they're ignored)
- Add CODEOWNERS (just you)
- Add issue templates: bug report, discussion, security-disclosure-notice
- Verify `.env.example` has no real values
- Double-check commit history for anything sensitive before making the repo public

### A2. Documentation review
- README (done in this session — philosophy, threat model, non-goals)
- CONTRIBUTING.md (done in this session — low-expectation framing)
- LICENSE file (from P3)
- SECURITY.md — how to report vulnerabilities, threat model pointer, response expectation
- A short `docs/BOOK-MAPPING.md` connecting each feature area to book chapters, so contributors know where the design comes from

### A3. CI baseline
Minimal: `npm run lint && npm test && npm run build` on push/PR. No release automation, no coverage gates, no fancy matrix. Just enough that a drive-by PR can't break main silently.

### A4. One clean release
- Tag `v0.1.0-alpha`
- Release notes that honestly describe state ("this is a book companion in active development")
- No binary artifacts, no Docker Hub push — people clone and build

### A5. Flip the repo to public
Only after A1–A4. Announce in whatever venue makes sense for the book launch, framed as "the tool that embodies the argument," not "new SRE product."

---

## Track B: Multiple surfaces, one codebase

The Resilience Companion ships multiple ways to interact with the same backend. Every surface is a thin adapter over the API. All produce the same ORR artifact — a review started in Slack can be continued in the web UI or picked up by a Claude Code skill.

| Surface | Where it lives | What it is | Depends on |
|---|---|---|---|
| **Web** | `packages/web/` + `packages/api/` | Full web app — structured multi-section, multi-session reviews | API server (`docker compose up`) |
| **Slack** | `packages/slack/` | Slack bot — slash commands + threaded conversations | API server + auth (P1) |
| **MCP** | `packages/mcp/` | MCP server — thin adapter exposing API routes as intent-based tools | API server + auth (P1) |
| **Skills** | `skills/` at repo root | Prompt layer — facilitation knowledge + MCP tool config | MCP server (which requires API server) |

### Architecture: the API is the core

```
resilience-companion/
├── packages/
│   ├── shared/          # Types, constants, templates — used by all packages
│   ├── api/             # Hono server + DB + agent loop — THE shared backend
│   ├── web/             # React UI (one way to consume the API)
│   ├── slack/           # Slack bot — slash commands + threaded review sessions
│   └── mcp/             # MCP server — thin adapter over api routes
├── skills/              # Claude Code skills — prompt layer on top of MCP
│   ├── resilience-orr/
│   │   ├── SKILL.md     # ORR facilitation knowledge + MCP server config
│   │   └── .mcp.json    # Points at packages/mcp/ as tool provider
│   ├── resilience-incident/
│   │   ├── SKILL.md     # Incident analysis facilitation
│   │   └── .mcp.json
│   └── resilience-check/
│       ├── SKILL.md     # Quick resilience health check
│       └── .mcp.json
├── evals/               # Eval framework
└── docs/
```

**The key insight**: There is no `packages/core/`. The API already *is* the shared backend — it holds the database, the agent loop, the templates, the teaching moments, the depth assessment logic. Extracting a separate `core/` package would be premature refactoring that creates a sync surface for zero benefit.

- **Web** talks to the API via HTTP (existing React Query client)
- **Slack** talks to the API via HTTP (Bolt bot, slash commands + threads)
- **MCP** talks to the API via HTTP (thin adapter, same routes)
- **Skills** talk to the API via MCP tools (prompt layer delegates all persistence to MCP)

All surfaces read and write the same ORR rows in the same database. A review started via `/create-orr` in Slack shows up in the web UI, can be continued via a Claude Code skill, and vice versa.

**What skills contain**: facilitation knowledge (the Socratic method, depth rubrics, escalation ladder, question frameworks) embedded as prompt text in SKILL.md. What they do NOT contain: any persistence, state, or assessment logic. When the skill needs to read a section, record a discovery, or update a depth assessment, it calls an MCP tool, which calls the API.

**Why not standalone skills?** A standalone skill (no server) would produce a different artifact — a conversation transcript in the IDE, not a structured ORR in the database. The user's constraint is clear: "one ORR should be consumed either way." Skills without MCP would create a parallel, incompatible experience.

### B1. Slack bot — first thin adapter, proves the pattern

`packages/slack/` — Bolt for JavaScript app (~200-300 lines). Ships first because:
- Teams already live in Slack — zero adoption friction
- Validates the "API is the core" architecture with a real adapter before building MCP
- Threaded conversations are a natural fit for the session model
- If this works, we *know* MCP will work — same pattern

**Slash commands**:
- `/create-orr <service-name>` → `POST /api/v1/orrs` — creates ORR, opens a thread for the first section
- `/load-orr <id>` → loads existing ORR (started from web, another Slack session, or any surface), resumes in-thread
- `/list-orrs` → shows team's ORRs with status and staleness

**Threaded conversation**: Each thread is a session. User messages in the thread go to `POST /api/v1/orrs/:id/sessions/:sid/messages`. Agent responses stream back to the thread (SSE events → Slack message edits for streaming feel). Section transitions, depth assessments, discoveries — all happen API-side.

**Auth**: PAT from P1, configured as a Slack app environment variable.

**Success criterion**: `/create-orr payments-service` in Slack → threaded review conversation → resulting ORR visible in web UI with full section content, depth assessments, and discoveries. `/load-orr 42` picks up an ORR that was started in the web UI.

**Timebox**: ~3-4 days. The bot is thin — all facilitation logic is API-side.

### B2. MCP server + Skills (ship together)

Since skills depend on MCP and MCP is a thin adapter over existing API routes, these ship as one unit. Same pattern as B1 (Slack), now proven.

**MCP server** (`packages/mcp/`):
- stdio transport first (local-only, used by Claude Desktop / Code), HTTP later
- Authenticates via PAT from P1
- Exposes tools named by **intent, not CRUD** (inspired by [unlost](https://github.com/unfault/unlost)'s model):
  - `recall` — given a service, dependency, or failure mode, surface what we know from prior ORRs, incidents, and postmortems
  - `reflect` — given a service or team, summarize learning quality trends, blind spots, depth progression
  - `challenge` — given a claim or assessment, find contradicting evidence from prior practices
  - `explore` — given a scenario, search for related real-world incidents and experiment suggestions
  - Plus CRUD wrappers: `list_orrs`, `read_section`, `update_section`, `record_discovery`, `add_action_item`
- Each tool calls existing API routes — not a reimplementation

**Skills** (`skills/`):
- **`resilience-orr/SKILL.md`**: Guides Claude through facilitating an ORR conversation. Includes the 11-section question framework, depth assessment rubrics, Socratic facilitation rules, a few teaching moments as examples. `.mcp.json` points at the MCP server for all persistence.
- **`resilience-incident/SKILL.md`**: Same pattern for incident analysis — timeline construction, contributing factors, action items.
- **`resilience-check/SKILL.md`**: Quick 10-minute resilience spot-check — subset of highest-signal ORR questions.

**Success criterion**: Start the Companion (`docker compose up`), open Claude Code in any repo, use the ORR skill to run a review. The resulting ORR appears in the web UI with full section content, depth assessments, and discoveries.

Distribution: folders in the repo. CI syncs `skills/` content to any alternate locations.

**Timebox**: ~1 week. MCP is mechanical (adapter over existing routes). Skills are prompt engineering (the hard part is the facilitation knowledge, which already exists in the system prompt).

### B3. OpenAPI spec

Adopt `@hono/zod-openapi` or equivalent. Annotate the ~10 routes most relevant to external agents. Generate `/api/v1/openapi.json`. Serve Scalar or similar at `/api/v1/docs`.

**Scope**: Routes are already typed; annotation is mechanical. Couple of days. Can run in parallel with B1/B2.

### B4. Dogfood for one week

Use all surfaces yourself:
- Slack: does `/create-orr` + threaded conversation feel natural? Can you `/load-orr` something started in the web UI?
- Skills: do they actually change how Claude helps you think about resilience while coding? Does the ORR created via skill look identical to one created via web or Slack?
- MCP: do you reach for recall/reflect/challenge while working on the Companion itself?
- Web: can you pick up a review started from any other surface and continue it?

Record what worked, what was noise, what was missing. The one-artifact constraint is the primary thing to validate.

### B5. (Conditional) Expand based on B4

Only if dogfooding proves the pattern:
- More skills (drift detection, chaos experiment design)
- More MCP tools
- Retrieval backend (contextual recall plan rejoins here — intent tools get real backends)
- Multi-platform packaging (Cursor, Copilot, Windsurf — following caveman's pattern)
- Slack enhancements (interactive blocks for section navigation, emoji reactions for flags)

---

## Sequencing (what I'd actually do, in order)

```
Week 1:  P1 (auth/PATs) + P2 (Postgres)       ← P1 blocks adapters; P2 blocks multi-team + graph
Week 2:  B1 (Slack bot)                        ← first adapter, proves the pattern
         P3 (security pass) + A1 + A2          ← parallel
Week 3:  B2 (MCP server + skills)             ← same pattern as Slack, now proven
         B3 (OpenAPI annotation)               ← mechanical, parallel with B2
         evals (first 10 scenarios)
Week 4:  B4 (dogfood all surfaces)            ← validate one-artifact constraint
         A3 (CI + eval integration)
Week 5:  P4 (license) + A4 (tag v0.1.0-alpha)
Week 6:  A5 (go public) — only if weeks 1–5 landed cleanly
```

Weeks are elastic. The *order* is the important part. In particular:

- P1 before B1 — no auth, no adapters
- P2 (Postgres) in week 1 — quick migration (Drizzle abstracts the dialect), enables multi-team and later knowledge graph
- B1 (Slack) before B2 (MCP+Skills) — Slack proves the adapter pattern; if Slack works, MCP is the same thing
- B2 ships MCP + skills together — skills depend on MCP for persistence
- A1–A4 before A5 — no public repo before the basics are in place
- B4 before any expansion of B5 — evidence before scope
- Evals start in week 3, grow from there — they're not gated on all surfaces being perfect
- Contextual recall (knowledge graph via AGE) comes after B5 proves the surfaces work — see `CONTEXTUAL-RECALL-PLAN.md`

---

## What this plan deliberately does NOT do

- Build OAuth / SSO / login. PATs for programmatic clients, proxy headers for enterprise SSO. We don't build identity — we trust the proxy.
- Build a hosted MCP endpoint. Self-hosted is the product; there is no "hosted Resilience Companion."
- Add a separate graph database. Postgres + Apache AGE gives graph queries in the same DB. See `CONTEXTUAL-RECALL-PLAN.md`.
- Rewrite the UI. It's a demo surface. Leave it alone unless it breaks.
- Gate open-sourcing on the Liz test. A1–A5 can ship with only P1+P2 done; B1–B5 can follow. Don't let "agent-native" perfectionism delay the public release indefinitely.
- Chase every issue after going public. CONTRIBUTING.md already sets expectations low for a reason.
- Extract a `packages/core/` library. The API already *is* the core. Extracting pure functions into a separate package creates a sync surface for zero benefit. If that changes later, refactor then.
- Ship skills without MCP. A standalone skill produces a conversation transcript, not a structured ORR. One artifact, any surface — that's the constraint.
- Create a separate repo for skills. One repo, two surfaces + prompt layer. Splitting repos splits maintenance for zero benefit at this scale.
- Build a skill factory / generator. We need 2–3 hand-crafted, deeply-researched resilience skills, not a system to mass-produce them.

---

## Open questions

1. **License**: MIT? Recommendation: yes. Needs your confirmation.
2. ~~**PAT UI**~~: **Resolved** — settings page ships with P1. One-time token creation needs to be easy.
3. **OpenAPI effort**: full annotation of all 18 routes, or just the ~10 Liz-test-relevant ones for v0.1? My vote: just the relevant 10 for v0.1, fill in the rest later.
4. **MCP transport**: stdio (local-only, used by Claude Desktop / Code) or HTTP (remote-callable)? Probably both — stdio ships first because it's simpler.
5. **Timing vs book**: does the open-source flip need to coincide with a book update, or is it independent?
6. **Code of Conduct**: Both unlost and rebound/fault-cli use the Debian Project CoC (short, practical). Alternative is Contributor Covenant (longer, more widely recognized). Recommendation: Debian-style for brevity.
7. **Skills scope**: Start with ORR + incident + quick-check (3 skills), or just ORR (1 skill) to prove the format?
8. **Multi-platform skills**: Ship for Claude Code only first, or also package for Cursor/Copilot/Windsurf from day one? Caveman ships all 6; skill-factory ships 5. Recommendation: Claude Code only first — add others once the SKILL.md content is proven.
9. **Eval budget**: Model-graded evals cost real money (LLM calls). Set a monthly budget ceiling, or run only in CI on agent-touching PRs?

---

## Eval framework

Based on [Anthropic's "Demystifying Evals for AI Agents"](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) and [caveman](https://github.com/JuliusBrussee/caveman)'s three-arm eval pattern. The Companion's agent is a *conversational agent* — which means we need to evaluate both **task completion** (did the review surface real insights?) and **interaction quality** (did the agent facilitate well?).

### Eval types for the Resilience Companion

| What we're evaluating | Grader type | Example |
|---|---|---|
| **Depth accuracy** | Code-based | Given a simulated shallow answer, does the agent correctly assess SURFACE, not DEEP? |
| **Tool use correctness** | Code-based | When a dependency is mentioned, does the agent call `record_dependency`? When a risk is identified, does it call `set_flags`? |
| **Facilitation quality** | Model-based rubric | Does the agent ask follow-up questions rather than lecturing? Does it probe rather than accept surface answers? Does it maintain Socratic style? |
| **Engagement detection** | Code-based | Given a conversation with terse "I don't know" answers, does the engagement detector flag FRUSTRATED? |
| **Retrieval relevance** (once built) | Model-based | When `recall` fires, are the returned results actually relevant to the current discussion? |
| **Session summary quality** | Model-based rubric | Does the summary capture key findings, not just restate prompts? |
| **Consistency (pass^k)** | Statistical | Same scenario run 5 times — does the agent reach the same depth assessment each time? |

### Simulated users

The key technique from Anthropic's article: **use a second LLM to simulate team members** with defined personas:

- **Confident expert**: Gives detailed, accurate answers. Test: does the agent still push for depth, or does it accept fluent answers at face value? (fluency illusion detection)
- **Uncertain team member**: Hedges, says "I think" and "probably." Test: does the agent detect frustration/uncertainty and adapt?
- **Defensive team member**: Pushes back on questions, says "we've always done it this way." Test: does the agent maintain Socratic style without confrontation?
- **Surface-only responder**: Gives one-line answers that recite documentation. Test: does the agent probe for understanding beyond recitation?

### Implementation approach (caveman-inspired)

Following caveman's evidence-in-the-repo pattern:

1. **`evals/` directory** at repo root with:
   - `scenarios/` — YAML-defined test cases (persona + section + expected behaviors)
   - `graders/` — code-based and model-based grading logic
   - `results/` — git-committed snapshots for reproducibility
   - `run.py` or `run.ts` — single command to execute eval suite
2. **Start with 20–30 scenarios** drawn from real ORR sessions and known failure modes
3. **Three-arm design** where applicable: baseline (no adaptive features) vs current agent vs proposed change
4. **Metrics**: pass@1 (first-try success), pass^3 (consistency across 3 trials), token efficiency
5. **CI integration**: run evals on PR if agent code or system prompt changes (Track A3)

### Sequencing

Evals are **not gated on Track B (MCP)**. They can start as soon as the agent code is stable enough to test against:

- **Week 2–3** (parallel with security pass): Write first 10 scenarios + code-based graders for depth assessment and tool use
- **Week 4**: Add model-based graders for facilitation quality
- **Week 5+**: Simulated user personas, consistency metrics
- **Ongoing**: Every agent bug becomes a new eval scenario (regression suite grows from capability suite)

### Additional techniques (from [learn-prompting.fr](https://learn-prompting.fr/blog/claude-evaluations-guide))

- **Test case distribution**: 40% happy path, 25% edge cases, 15% adversarial (team resists, asks for answers), 10% mixed engagement, 10% empty/refusal — adapted from their 40/25/15/10/10 formula
- **Anthropic Console**: Use the built-in eval tool for rapid A/B testing of system prompt variants before building full harness. Free, already exists.
- **Model-graded rubrics via SDK**: Call Claude to evaluate Claude's facilitation transcripts against structured rubrics. Scale better than human review, calibrate against human judgment periodically.
- **Temperature=0 for reproducibility** during eval runs

### What this does NOT include

- Evals for the web UI (not the product)
- Load testing or performance benchmarks (different concern)
- Evals for retrieval quality (deferred until contextual recall is built)
- Automated re-training or prompt optimization (manual for now — read transcripts, adjust prompts)

---

## Lessons from comparable projects

Studied five open-source projects from the resilience/developer-tools space (April 2026):

| | [unlost](https://github.com/unfault/unlost) | [rebound](https://github.com/rebound-how/rebound) | [fault-cli](https://github.com/fault-project/fault-cli) | [caveman](https://github.com/JuliusBrussee/caveman) | [skill-factory](https://github.com/alirezarezvani/claude-code-skill-factory) |
|---|---|---|---|---|---|
| License | MIT | Apache-2.0 | Apache-2.0 | MIT | MIT |
| Stars | ~15 | ~20 | ~10 | ~9.6k | ~683 |
| CONTRIBUTING.md | No | No | No | No | No |
| SECURITY.md | No | No | No | No | No |
| Issue templates | No | Bug only | No | No | Yes (2) |
| Code of Conduct | Debian CoC | Debian CoC | Debian CoC | No | No |
| CHANGELOG | Yes (good) | Empty at root | Yes (good) | No | No |
| Evals in repo | No | No | No | Yes (three-arm) | No |
| Multi-platform dist | No | No | No | Yes (6 platforms) | Yes (Claude Code, Cursor, Copilot, etc.) |

**What we're already ahead on**: CONTRIBUTING.md, threat model, "what this isn't" framing, issue templates (planned). None of the five have all of these.

**What to steal**:
- **unlost**: scenario-based "when do you need this?" framing; collapsible `<details>` for architecture; personal motivation statement; intent-based tool naming (recall/reflect/challenge/explore)
- **fault-cli**: asciicast/demo in README; CHANGELOG as release notes source
- **rebound**: monorepo with per-sub-project READMEs; separate build vs release workflows
- **caveman**: evidence-in-the-repo (three-arm evals with cached snapshots); multi-platform distribution from one source; single canonical file synced by CI; test case distribution formula
- **skill-factory**: `.claude/skills/` distribution format; SKILL.md as manifest with YAML frontmatter; multi-agent-platform packaging (Claude Code, Cursor, Copilot, Windsurf, Codex); modular CLAUDE.md per subdirectory

**What to avoid**:
- All five have bare community infrastructure (no CONTRIBUTING, no SECURITY). We ship with these from day one.
- skill-factory's "factory of factories" meta-pattern — over-engineered for our needs. We want 2–3 hand-crafted skills, not a generator.
- caveman's character-voice-throughout approach — fun but doesn't fit the book's tone.

---

## What to look at next session

- `packages/api/src/middleware/auth.ts` — current JWT stub, to plan P1 (PATs)
- `packages/api/src/db/schema.ts` — current SQLite schema, to plan P2 (Postgres migration via Drizzle)
- `packages/api/src/routes/` — scan for routes that already use zod schemas (OpenAPI annotation becomes trivial there)
- Existing issue in memory about security priorities — pull those items into P3 explicitly
- `packages/api/src/agent/system-prompt.ts` — facilitation knowledge that needs to be distilled into SKILL.md prompt text
