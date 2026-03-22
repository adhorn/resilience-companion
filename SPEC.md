# Resilience Companion — Specification

A self-hosted tool that helps organizations run Operational Readiness Reviews focused on learning, knowledge sharing, and conversation — not compliance.

## Long-Term Vision

The Resilience Companion is the first practice in what becomes a unified learning system across all five resilience practices from the book: **Operational Readiness Reviews, Load Testing, Chaos Engineering, GameDays, and Incident Analysis.** Each practice feeds the others — an ORR finding about an untested failure mode becomes a chaos experiment, a chaos experiment reveals a monitoring gap that updates the ORR, an incident analysis surfaces a pattern that informs future GameDays. The book's core argument is that these practices only work as an interconnected learning system, not as isolated activities.

We start with ORRs because they're the broadest practice — they touch every other practice and every part of operational understanding. Ship ORR well, prove the model (agentic facilitation, teaching moment library, API-first platform), then extend the same architecture to the other four practices. The teaching moment library, case studies, dashboard, and API/MCP surface are all designed to grow beyond ORRs.

---

## Core Philosophy

ORRs are conversations, not checklists. The real value comes from experienced engineers sharing pattern recognition, stories, and operational intuition with teams. This tool exists to make those conversations happen more often, capture what's shared, and make expert knowledge compound over time.

The tool never replaces human judgment or conversation. When AI facilitates, it's because no expert is available — and it's transparent about that limitation.

---

## Users & Roles

**Service Team**: Owns the ORR for their service. Creates, updates, works through sections. Can complete the async phase independently with AI assistance.

**Reviewer / Senior Engineer**: Brings operational experience. Joins for live sessions (full review or specific sections). The tool assists them — captures teaching moments, tracks coverage, provides preparation briefs. The tool does NOT ask questions when a reviewer is present.

**Org Leadership**: Views the dashboard for coverage, activity patterns, and staleness. Does not interact with individual ORRs.

---

## Three Facilitation Modes

### Mode 1: Expert-Led Review

A senior engineer with operational experience facilitates. The tool becomes their assistant.

**Before the session:**
- Reviewer gets a link to the ORR
- Preparation brief shows: what the team has already covered (async or previous sessions), where answers were thin, where the AI detected uncertainty, which sections haven't been explored yet

**During the session (two capture options — team chooses what fits):**

*Option A: Live note-taking with AI assistance*
- A designated note-taker types in the tool during the session
- AI assists in real time: suggests what to capture, flags potential teaching moments, helps structure notes
- Like a smart collaborative doc during the meeting

*Option B: Transcript import (post-session)*
- Team pastes or uploads a meeting transcript from their existing meeting tool (Zoom, Teams, etc.)
- AI processes the transcript after the session to extract teaching moments, update ORR sections, and identify key discussion points
- Simplest path — no real-time capture needed, works with whatever meeting tool they already use

In both options:
- The tool tracks section coverage so the reviewer (or team) can see what was discussed and what was skipped
- The AI does NOT interject or ask its own questions during live sessions

**After the session:**
- AI drafts candidate teaching moments from the notes or transcript
- Reviewer receives a summary and approves which teaching moments to publish (within a configurable window, e.g. 7 days). Unpublished drafts remain in draft, not visible in the library.
- Approved teaching moments are tagged by topic and system pattern, linked to the reviewer
- The ORR living document updates with what was discussed and discovered

### Mode 2: AI-Assisted Review (Self-Serve)

No senior engineer available. The AI facilitates the conversation.

**How the AI behaves:**
- Asks open-ended questions: "What concerns you most about database connection behavior?" not "Do you have monitoring for database connections?"
- Detects shallow answers and probes deeper: "You mentioned you have circuit breakers — walk me through what happens when they trip during a deployment"
- Draws on the **teaching moment library** from past expert-led reviews. When relevant, surfaces them: *"In a previous review, [reviewer name] shared this about slow responses vs failures in a similar architecture..."*
- Explicitly flags when a topic would benefit from human expertise: *"This is an area where operational experience matters — consider finding time with someone who's responded to similar incidents"*
- Never pretends to have operational experience. Transparent about what it is.
- Adapts tone: curious peer for exploration, Socratic for shallow answers, direct when something looks like a gap

**AI teaching behavior:**
- When teams encounter unfamiliar concepts (circuit breakers, blast radius, steady state), explains inline with a short definition and a link to deeper material
- References relevant book concepts when appropriate (WAI vs WAD, learning levels, tensions)
- Preserves productive struggle — provides scaffolding, not answers. Bainbridge's irony: if the AI does the thinking, the team doesn't build the understanding

### Mode 3: Hybrid (Async Prep + Expert Session)

The most practical mode for most organizations.

**Async phase:**
- Team works through sections with AI assistance (Mode 2 behavior)
- AI probes for depth, catches shallow answers, helps the team articulate what they know and don't know
- Covers the "do you have X?" ground so the expert doesn't have to

**Live phase:**
- Senior engineer joins with the preparation brief showing exactly where the interesting gaps are
- Expert time goes to highest-value conversations: stories, pattern recognition, judgment calls
- Tool captures teaching moments as in Mode 1

---

## User Experience: Portal

The tool is a web portal. No exotic UI paradigms — familiar, low-friction, works like any internal tool teams already use.

### Core Flow

1. **Team lands on the portal** → sees their team's ORRs (or creates a new one)
2. **Start new ORR** → select a service, get the default template pre-loaded. Team can edit the template before starting (remove sections, add questions, reword prompts).
3. **Work through sections** → each section is a page/panel. In AI-assisted mode, the right side is a conversational panel where the AI asks questions and the team responds. The left side shows the evolving ORR document — what's been captured so far, depth indicators, flags.
4. **Section view** → team sees: the prompt/question, their current response, AI's depth assessment (shallow/adequate/deep), any linked teaching moments, any flags. They can edit their response directly or continue the conversation to deepen it.
5. **Coverage overview** → a progress view showing all sections: which are complete, which need work, which haven't been started. Not a progress bar — a map of where understanding is deep vs thin.
6. **Invite reviewer** → team shares a link. Reviewer sees the preparation brief first, then the full ORR with flags and depth assessments highlighted.
7. **Dashboard** → org-wide view of all ORRs, filterable by team/status/staleness. This is what leadership sees.

### Key UX Principles

- **Document-first, not chat-first.** The ORR document is always visible and editable. The AI conversation is a helper panel, not the main interface. Teams should feel like they're building a document with AI help, not chatting with a bot.
- **Progressive disclosure.** The portal starts simple (pick a service, answer questions). Advanced features (teaching moment library, drift detection, cross-practice connections) are discoverable but not in the way.
- **Low ceremony.** No onboarding wizard. No mandatory fields before starting. Team picks a service, gets a template, starts writing. Everything else is optional.

---

## Bootstrapping: Day-One Value

On day one, the teaching moment library is empty. No org-specific expert knowledge exists yet. The tool must still be useful.

### Public Incident Seed Data

The tool ships with a curated seed library extracted from public post-mortems and incident reports. Sources:

- [danluu/post-mortems](https://github.com/danluu/post-mortems) — ~100+ categorized incidents from major tech companies (config errors, hardware failures, database issues, time-related bugs, cascading failures)
- [icco/postmortems](https://github.com/icco/postmortems) — structured post-mortem database with metadata, categories, and time data. Available at postmortems.app.
- [ggalihpp/awesome-incident-postmortem](https://github.com/ggalihpp/awesome-incident-postmortem) — structured post-mortems from AWS, Cloudflare, GitHub, and others

**Seed data processing**: A build-time script processes these sources into two things:

1. **Teaching moments** — extracted lessons tagged by topic and ORR section. These go into the teaching moment library, clearly marked as public knowledge.
2. **Case studies** — the incidents themselves, structured as browsable learning material within the tool.

The processed seed data is baked into the Docker image. No admin action needed — it's there on first boot.

### Public Incidents as Learning Material

Beyond feeding the teaching moment library, the public incidents are presented directly in the tool as learning resources:

- **Section-linked case studies**: Each ORR section can show relevant public incidents. When a team is working on "Failures, Impact & Adaptive Capacity," they can see real examples: *"GitHub (2018): Database failover triggered unexpected behavior because the failover path had never been tested under realistic load"*
- **Browse by topic**: A "Learn" section in the portal where teams can explore public incidents organized by failure category (config errors, cascading failures, dependency issues, etc.)
- **AI references them in context**: During AI-assisted reviews, the agent can reference specific public incidents when probing: *"This is similar to what happened at Cloudflare in 2022 — want to explore whether your service has similar exposure?"*

All public data is clearly labeled — teams always know whether they're seeing industry knowledge or their own org's learnings.

### Bootstrapping Progression

1. **Day one**: Public incident seed data (teaching moments + case studies) + AI facilitation
2. **First expert reviews**: Org-specific teaching moments start accumulating
3. **6+ months**: Library is a mix of public and org-specific, weighted toward org-specific
4. **Steady state**: Org-specific teaching moments are the primary resource; public incidents remain as background reference

---

## ORR Template & Customization

### Default Template

The default template comes directly from the book's Appendix (orr-template.markua). It is explicitly "A template, not THE template" — teams should make it their own.

**11 sections, ~107 open-ended prompts:**

1. **Service Definition and Goals** (5 prompts) — What the service does from the customer's POV, SLAs, scaling drivers, security review process
2. **Architecture** (10 prompts) — System components, scaling behavior, blast radius reduction, single points of failure, dependencies, request volumes
3. **Failures, Impact & Adaptive Capacity** (16 prompts) — Per-component failure modes, dependency limits, AZ failure walkthrough, graceful degradation, untested assumptions, manual interventions
4. **Risk Assessment** (7 prompts) — What worries you, what doesn't, what you cut, what will catch fire first, cost/scaling surprises
5. **Learning & Adaptation** (5 prompts) — Near-miss learning, cross-team sharing, capturing institutional knowledge, revising mental models after incidents
6. **Monitoring, Metrics & Alarms** (20 prompts) — Customer experience monitoring, alarm coverage, dashboard gaps, dependency monitoring, drift detection signals ("what behaviors have you started accepting as okay?")
7. **Testing & Experimentation** (12 prompts) — Test strategy, dependency testing, monitoring verification, chaos experiments, GameDay plans, testing for the unanticipated
8. **Deployment** (10 prompts) — Pipeline walkthrough, manual touchpoints, rollback experience, config validation, infrastructure modification
9. **Operations & Adaptive Capacity** (13 prompts) — On-call rotation, 3am documentation access, runbook freshness, escalation paths, decision-making under ambiguity, novel situation coordination
10. **Disaster Recovery** (11 prompts) — Access models, DR exercises, RTO/RPO measurement, backup restoration experience, operational levers, runbook currency
11. **Organizational Learning** (8 prompts) — Blameless reviews, procedure questioning, design decision capture, cross-team incident learning, lessons-to-action pipeline

The template includes preamble guidance: who should conduct ORRs (entire service team for diverse perspectives), when (early in design, throughout development, before launch, after changes, annually), and how ORRs differ from architecture reviews.

*Note from template: "Security must have its own, in-depth review."*

### Customization

- Teams can select which sections apply to their service
- Teams can edit existing prompts or add their own
- Teams can remove prompts that don't apply
- Organizations can create custom templates for different service types (e.g., data pipeline vs user-facing API)
- Sections can be marked as required or optional at the org level

---

## Living Document

An ORR is not a one-time event. It's a living document that reflects the team's current understanding of their service.

- The ORR persists after completion and can be revisited
- When revisited, the tool shows what changed since the last review (side-by-side diff)
- AI can comment on drift: "Last time you said failover takes 30 seconds — is that still accurate given the architecture changes since then?"
- Previous versions are preserved for comparison
- Findings and teaching moments from the review remain attached and searchable

---

## Teaching Moment Library

The mechanism that makes expert knowledge compound over time.

**Capture:**
- During expert-led sessions, the tool identifies candidate teaching moments from live notes or imported transcripts: stories shared, patterns explained, connections to other systems, explanations of *why* something matters
- AI drafts teaching moments; the reviewer approves which ones to publish. Unapproved drafts stay in draft state and are not visible in the library.
- Tagged by: topic (circuit breakers, failover, deployment safety...), system pattern (microservices, monolith, event-driven...), failure mode, and the reviewer who shared it
- Attribution matters — a teaching moment is a pointer back to a person, not an abstraction

**Surfacing:**
- In future reviews (any mode), relevant teaching moments appear in context when teams discuss related topics
- Presented as: "Here's what [name] shared about this when reviewing a similar system" — not generic advice
- Teaching moments can be browsed and searched outside of reviews

**Growth:**
- Every expert-led review makes future AI-assisted reviews better
- Over time, this becomes the organization's operational wisdom library — built through conversation, not a documentation initiative

---

## Knowledge & Contributor Tracking

**Knowledge concentration detection:**
- Tracks which people contribute to which sections across reviews
- If one person is the only reviewer who ever covers database concerns, that's a concentration risk — flagged
- Surfaces: "Only 2 people in the org have reviewed failure mode sections — consider broadening"

**Contributor map:**
- Shows who has reviewed what, across services and topics
- Helps teams find the right expert when they need one for a live session
- Makes visible where expertise is thin

---

## Drift Detection

**Side-by-side comparison:**
- When revisiting an ORR, shows previous answers alongside current state
- Makes visible what has changed (or what should have changed but hasn't)

**AI commentary:**
- AI highlights where answers may have drifted from reality: "You described a 3-service architecture last review, but your deployment config now references 5 services"
- Flags sections that are most likely stale based on time and system changes

---

## Dashboard

### Team View

- All ORRs for the team's services
- Status: Not started, In progress, Complete, Needs refresh
- Time since last meaningful update
- Sections that need attention

### Organizational View

**Coverage & Activity:**
- All ORRs across the organization by status
- Which services have never had an ORR
- Which services have stale ORRs (not refreshed in configurable period, default 12 months)
- Which ORRs have been in progress for too long (stuck detection)

**Staleness & Attention Signals:**
- ORRs that haven't been updated in N months move to "Needs refresh"
- ORRs stuck in progress for N weeks get surfaced
- Notifications (email or webhook): "Your ORR for payment-service was last updated 14 months ago"
- Not punitive — framed as "systems drift, it may be worth revisiting"

**Effectiveness Signals (activity patterns, not quality scores):**
- Are reviews producing discoveries that surprise teams?
- Are teaching moments accumulating and being reused?
- Are ORR findings connecting to other practices (chaos experiments, load tests)?
- Are stale reviews getting refreshed?
- Teaching moment volume: are expert-led reviews producing captured knowledge?
- Section depth patterns: which sections consistently get shallow treatment across the org (template may need work there)
- Coverage: which practices, services, teams have gaps

**What we deliberately do NOT measure:**
- ORR quality scores
- Completion speed as a target
- Number of gaps found (incentivizes finding trivial gaps or hiding real ones)
- Reviewer ratings or rankings
- Any metric that could become a surrogate for learning

**Surrogation warning (visible in dashboard):**
*"These metrics describe activity patterns, not learning quality. If any metric becomes a target, it ceases to be useful."*

---

## Cross-Practice Connections (Built-in, Optional)

When an ORR reveals a gap or produces a discovery, the tool can suggest follow-up actions in other practices:

- ORR finding about untested failure mode → suggest chaos experiment
- ORR finding about unknown load limits → suggest load test
- ORR finding about unclear incident response → suggest GameDay scenario

These suggestions are lightweight — a prompt, not a workflow. Teams can act on them or not. If connected to the Gap learning system, discoveries flow between practices.

---

## API-First & Agent-Friendly

The portal is one client. The API is the product.

Every capability the portal uses must be available through clean, documented REST endpoints. The Resilience Companion is a platform primitive in the developer's toolchain, not a walled garden that requires humans to context-switch into a separate UI.

### Why This Matters

Developer workflows are increasingly agent-assisted. If the Resilience Companion requires manual portal visits to be useful, it becomes friction. If an agent can query it, update it, and surface relevant context while the developer is working on their service — it becomes part of the flow.

### API Surface

All operations are API-accessible:

- **ORR lifecycle**: Create, read, update status, list by team/service/status
- **Section operations**: Read/update section content, read depth assessments and flags
- **Teaching moment library**: Query by topic/section/pattern, browse, read
- **Case studies**: Query by failure category, section relevance
- **Dashboard data**: Coverage, staleness, effectiveness signals
- **Session management**: Start a session, send messages, end a session (for programmatic AI-assisted reviews)

The API is authenticated via OAuth tokens (same OIDC provider as portal login). No separate API keys to manage, no credentials that outlive team membership.

### MCP Server

The Resilience Companion exposes itself as an MCP (Model Context Protocol) server. This lets any MCP-compatible agent (Claude Code, Cursor, custom agents) interact with it natively.

**What an agent can do via MCP:**

- `orr.get_status(service)` — "Does this service have an ORR? What's its status?"
- `orr.get_sections(service)` — "What sections need attention? Where are the gaps?"
- `orr.get_teaching_moments(topic)` — "What do we know about circuit breaker failures?"
- `orr.get_case_studies(failure_type)` — "Show me public incidents involving cascading failures"
- `orr.update_section(service, section, content)` — "Update the deployment section with what I just learned"
- `orr.check_staleness(service)` — "Is this ORR current or does it need a refresh?"

**Example workflows:**

- A developer is implementing retry logic. Their coding agent queries the ORR for the service, finds the "Failures, Impact & Adaptive Capacity" section flagged as shallow on retry strategy, and surfaces relevant teaching moments about retry storms — all without leaving the IDE.
- A CI/CD agent notices a deployment config change and checks whether the ORR's deployment section still reflects reality. If it looks stale, it opens a notification or creates a task.
- During incident response, an agent pulls the service's ORR to surface what the team documented about this failure mode and what recovery procedures exist.

### Auth for Agents

- OAuth 2.0 token flow — agents authenticate the same way humans do, via the org's identity provider
- No long-lived API keys. Tokens are scoped, short-lived, and tied to identity.
- Service accounts for CI/CD or automation agents, managed through the org's OIDC provider
- When a team member leaves, their access revokes everywhere — portal and API — because it's the same auth.

### Design Principle

Build the API first. Build the portal as a client of that API. Build the MCP server as a thin adapter over the same API. One source of truth, three access patterns (portal, REST API, MCP), same auth.

---

## Integration

### Default: Standalone
The tool works standalone with no external integrations required.

### Light Integration (Links & Context)
- Link to external monitoring dashboards, runbooks, architecture docs
- Pull service metadata from a service catalog if available
- Reference external incident history

### Deep Integration (Via Plugins)
- Import incident history from incident.io, PagerDuty, etc.
- Pull deployment data from CI/CD systems
- Connect to the Gap learning system for cross-practice discovery flow
- Plugin interface for organization-specific tools

---

## LLM Backend

Pluggable from day one. The tool does not depend on a specific LLM provider.

- Customer brings their own API key
- Supports multiple backends: OpenAI, Anthropic, local models (Ollama), Azure OpenAI, AWS Bedrock
- LLM is configured at deployment, not hardcoded
- All AI features degrade gracefully if no LLM is configured (tool still works as a structured review without AI probing)

---

## Distribution

**Self-hosted only.** No SaaS, no hosted version.

- Distributed as a Docker Compose package
- Customer provides: their own LLM API key, storage volume, optional SMTP/webhook config for notifications
- Single command to start: `docker-compose up`
- Data stays on the customer's infrastructure
- No phone-home, no telemetry, no external dependencies at runtime

---

## Data Model

### Core Entities

```
Team
  id, name, created_at

User
  id, name, email, team_id, role (member | reviewer | admin), auth_provider (local | oidc)

ORR
  id, service_name, team_id, template_version
  status: NOT_STARTED | IN_PROGRESS | COMPLETE | NEEDS_REFRESH
  visibility: TEAM | ORG
  created_by, created_at, updated_at, completed_at

Section
  id, orr_id, position, title
  prompts: json                    -- array of prompt strings (from template, editable)
  content: text                    -- team's current response (the living document)
  depth: UNEXPLORED | SHALLOW | ADEQUATE | DEEP
  depth_rationale: text            -- AI's explanation of depth assessment
  flags: json                      -- array of: NEEDS_EXPERT | UNCERTAIN | CONTRADICTS_OTHER | etc.
  conversation_snippet: text       -- most recent substantive exchange (for agent context)
  updated_at, updated_by

Session
  id, orr_id, user_id, agent_profile (facilitator | assistant | transcript_processor)
  summary: text                    -- narrative session summary written by agent
  sections_discussed: json         -- which section IDs were covered
  started_at, ended_at
  token_usage: int                 -- tokens consumed in this session

TeachingMoment
  id, title, content: text
  source: ORG | PUBLIC             -- clearly distinguishes org-specific from seed data
  source_orr_id: nullable          -- null for public seed data
  attributed_to: nullable          -- reviewer who shared it (null for public)
  status: DRAFT | PUBLISHED
  tags: json                       -- topic tags (circuit breakers, failover, etc.)
  section_tags: json               -- which ORR sections this is relevant to
  system_pattern: text             -- microservices, monolith, event-driven, etc.
  failure_mode: text               -- cascading, config error, dependency, etc.
  created_at, approved_at, approved_by

CaseStudy
  id, title, company, year
  summary: text, source_url: text
  failure_category: text           -- config error, cascading failure, dependency, time, etc.
  section_tags: json               -- which ORR sections this relates to
  lessons: json                    -- extracted key lessons

ORRVersion
  id, orr_id, snapshot: json       -- full ORR state at this point
  reason: SESSION_END | COMPLETED | REFRESH
  created_at

Template
  id, name, is_default: boolean
  sections: json                   -- array of { title, prompts[] }
  created_by, created_at
```

### Relationships

- Team has many Users, many ORRs
- ORR has many Sections, many Sessions, many ORRVersions
- ORR belongs to a Team, uses a Template
- Section belongs to an ORR, links to many TeachingMoments
- TeachingMoment can link to many Sections (many-to-many via tag matching, not FK)
- Session belongs to an ORR and a User

### Design Decisions

- **Sections store prompts as JSON**: When a team customizes prompts, the customization lives on the section, not the template. The template is a starting point.
- **Teaching moments link to sections by tag, not FK**: A teaching moment about "circuit breakers" is relevant to any ORR section discussing circuit breakers, not just the one where it was captured.
- **ORRVersion is a full snapshot**: Simple. No incremental diffs. Snapshots are cheap in SQLite.
- **Concurrency: last writer wins.** No locking, no conflict resolution. If two people update the same section, the last save takes effect. ORRs are team documents worked on together — if someone overwrites, the team will notice. Keeping it simple.
- **Template versioning**: When the org updates a template, existing in-progress ORRs keep their current sections. The ORR stores template_version so you can see which template it started from. New ORRs get the latest template. No migration of in-progress work.

---

## Architecture: Agentic Design

The core interactions in this tool are conversational, context-dependent, and require judgment. This is an agentic system, not a traditional CRUD API that calls an LLM for individual completions.

### The Central Problem: Context Across Sessions

An ORR review can span days or weeks across many sessions. LLM context windows are finite and conversations are ephemeral. The design must ensure nothing important is lost between sessions.

### Principle: The ORR Document Is the Memory

The LLM conversation is ephemeral — it starts fresh each session. The ORR state in the database is durable. Every time something meaningful happens in a conversation, the agent writes it back to persistent state. When a new session begins, the agent reads the current ORR state and picks up from there. It never replays old conversations.

### What Gets Persisted (Durable State in DB)

Per section:
- **Content**: What the team has said — their current answers, explanations, descriptions
- **Depth assessment**: AI's evaluation of answer depth (shallow / adequate / deep), with rationale
- **Flags**: Needs expert attention, uncertainty detected, contradicts another section, not yet explored
- **Linked teaching moments**: Relevant teaching moments that were surfaced or captured in this section
- **Conversation snippets**: The most recent substantive exchange for each section — enough context for the agent to pick up the thread, not the full history

Per ORR:
- **Session summaries**: At the end of each session, the agent writes a narrative summary. Not just structured flags — natural language that captures nuance: *"The team seemed confident about monitoring but hesitated when discussing what happens if the primary database fails over. They mentioned a workaround involving manual DNS changes that isn't documented anywhere."*
- **Coverage map**: Which sections have been discussed, how deeply, when
- **Draft teaching moments**: Pending reviewer approval
- **Version history**: Snapshots of the full ORR state at key moments (session end, completion, refresh)

### What Loads Into Context (Per Session)

When the agent starts a new session, it receives:

1. **ORR metadata**: Service name, team, current status, when it was last worked on
2. **Section states**: For each section — current content, depth assessment, flags, last conversation snippet
3. **Session history**: Summaries of previous sessions (not full transcripts — summaries)
4. **Relevant teaching moments**: From the library, matched to the sections being discussed
5. **Active context**: Which sections the user is currently working on (loaded in full), other sections loaded as summaries only

This keeps the context window focused. The agent doesn't need the full content of all 11 sections to have a productive conversation about failure modes. It needs the failure modes section in full, summaries of the others, and awareness of flags.

### Cross-Section Awareness

The agent sees summaries of all sections even when working on one. If it notices an obvious contradiction or connection ("your monitoring section says health checks are deep, but your failure modes section says you can't detect database failover"), it mentions it. This happens naturally from the summaries in context — no special cross-section reasoning engine needed. The session summary is also a good place to note cross-section observations for the next session.

### Agent Profiles

Different modes require different agent behaviors. Each is a distinct system prompt + tool set:

**Review Facilitator** (Mode 2: AI-assisted self-serve)
- System prompt: Review facilitation persona — curious, Socratic, transparent about limitations
- Tools: Read/write section content, query teaching moment library, update depth assessments, set flags, write session summary
- Behavior: Drives the conversation, probes for depth, surfaces teaching moments, detects shallow answers

**Session Assistant** (Mode 1: Expert-led)
- System prompt: Passive assistant — capture, don't facilitate
- Tools: Flag teaching moment candidates, update section coverage, write session summary, process live notes
- Behavior: Listens and captures. Does not ask questions or interject. Focuses on identifying teaching moments and tracking what was discussed.

**Transcript Processor** (Post-session, Mode 1 Option B)
- System prompt: Analytical — extract structure from unstructured conversation
- Tools: Read transcript, update section content, create draft teaching moments, write session summary, update coverage map
- Behavior: Processes a completed transcript. Maps discussion to ORR sections. Identifies teaching moments. Produces a session summary.

**Drift Analyst** (Living document refresh)
- System prompt: Comparative — find what changed and what should have changed
- Tools: Read current and previous ORR versions, read section history, generate drift commentary
- Behavior: Compares current ORR state against previous versions. Highlights staleness. Generates questions about potential drift.

**Preparation Brief Generator** (Before expert sessions)
- System prompt: Concise summarizer for an expert reviewer
- Tools: Read full ORR state, read session history, read depth assessments and flags
- Behavior: Produces a focused brief: where gaps are, where the team struggled, where expert attention would add the most value. Respects the reviewer's time.

### Write-Back: The Critical Path

The agent must write back observations during and after each session. If it notices something but doesn't persist it, it's lost. The write-back includes:

- Updated section content (what the team said or revised)
- Updated depth assessments (did the conversation deepen understanding?)
- New flags (expert needed, contradiction found, uncertainty detected)
- Conversation snippet (most recent substantive exchange, replacing the previous one)
- Session summary (narrative, written at session end)
- Draft teaching moments (from expert sessions)

Write-back happens:
- **Continuously** during a session (section updates, flags) — after each meaningful exchange, not just at the end
- **At session end** (session summary, final depth assessments)
- **On transcript processing** (bulk update after processing a transcript)

### Graceful Degradation

If no LLM is configured:
- The tool works as a structured review document — teams fill in sections manually
- No AI probing, no depth detection, no teaching moment extraction
- Dashboard, staleness tracking, and notifications still function
- The tool is still useful, just not agentic

---

## Tech Stack (Proposed)

- **Runtime**: Node.js + TypeScript
- **API**: Hono
- **Database**: SQLite + Drizzle ORM (zero infrastructure, portable)
- **Web**: React + Vite + TailwindCSS
- **LLM**: Pluggable adapter layer (OpenAI SDK compatible interface) with agent orchestration
- **Agent framework**: Lightweight custom agent loop (system prompt + tools + conversation management) — no heavy framework dependency
- **Real-time**: WebSocket or SSE for live note-taking sessions
- **Packaging**: Docker Compose (API + Web + SQLite volume)
- **Testing**: Vitest

---

## Access Control

ORRs contain sensitive information — system vulnerabilities, failure modes, operational weaknesses.

- **Team-scoped by default**: An ORR is visible to its owning team and invited contributors/reviewers
- **Org-visible option**: Teams can mark an ORR as visible to the whole org (useful for platform services)
- **Teaching moment library is org-wide**: Published teaching moments are visible to everyone. This is intentional — the whole point is knowledge sharing. But the source ORR's details are not exposed; the teaching moment stands on its own.
- **Dashboard**: Org view shows status and metadata (service name, team, staleness) but not ORR content. Leaders see coverage patterns, not answers.
- **Reviewer access**: Reviewers can see the full ORR for services they're invited to review

---

## Export

The ORR should not be a data prison. Teams need to share results outside the tool.

- **Markdown export**: Full ORR document as markdown — portable, pasteable into wikis, Confluence, Notion, etc.
- **PDF export**: For sharing with leadership or attaching to architecture reviews
- **Section-level copy**: Copy a single section's content for use elsewhere
- **Teaching moment export**: Export teaching moments as a collection (markdown or JSON)

---

## Cost Awareness

Every AI interaction costs money (customer's API key). The tool should be transparent about this.

- **Token budget per session**: Configurable limit on how many tokens the agent can use per session. Default to a reasonable limit. Surface usage to the team: "This session used ~4,000 tokens (~$0.03)"
- **Depth dial**: Configurable AI engagement level — "light" (fewer follow-ups, lower cost) vs "thorough" (more probing, higher cost). Teams choose based on their budget and the section's importance.
- **Transcript processing cost estimate**: Before processing a transcript, show estimated cost based on length
- **No surprise bills**: The tool should surface cumulative cost per ORR and per team. If a team is approaching a high spend, warn them.

---

## Known Limitations

Be honest about what the tool can and cannot do.

1. **Depth detection is a heuristic, not a judgment.** The AI's assessment of "shallow" vs "adequate" will be wrong sometimes. It will probe when the answer was fine and miss gaps an experienced reviewer would catch. It's a prompt to think harder, not an authority on understanding. Teams should treat it as a nudge, not a verdict.

2. **Session summaries are lossy.** Compressing a conversation into a narrative summary loses nuance. Over many sessions, you get compounding lossy compression. The conversation snippet per section helps, but the agent's ability to "pick up the thread" will degrade over long reviews with many sessions. This is an inherent limitation of the approach.

3. **LLM quality varies.** The Review Facilitator's nuanced probing will behave differently across models. Stronger models (Claude, GPT-4) will produce better facilitation than smaller local models. The tool works with any model, but the experience will vary. We should be transparent about recommended models.

4. **Drift detection is passive.** The tool notices when an ORR is old (staleness). It cannot independently detect that the service architecture changed last month. True drift detection requires deep integrations that feed real-time system state. Without those, "drift detection" means "staleness detection + AI asking whether things have changed."

5. **The tool doesn't fix culture.** If an organization doesn't value learning, adding a tool won't change that. The book's bedrock conditions (psychological safety, appropriate incentives, leadership support) must exist for ORRs to work — with or without this tool. The tool makes good ORRs easier; it can't make bad ORRs good.

---

## MVP Definition

Ship the smallest thing that's useful. Learn. Then expand.

### Phase 1: MVP

- **API-first**: All operations available via documented REST endpoints. Portal is a client of the API.
- **Portal**: Create ORR, select/edit template, work through sections
- **Mode 2 only**: AI-assisted self-serve review (the Review Facilitator agent)
- **Teaching moment library**: Seeded with public incidents, browsable, surfaced in reviews
- **Dashboard**: ORR status, staleness detection, basic coverage view
- **Export**: Markdown
- **Auth**: Local accounts only (OIDC comes later)
- **Single LLM backend**: Start with OpenAI-compatible API (covers OpenAI, Anthropic via proxy, Ollama)

What's deliberately deferred: Mode 1 (expert-led), Mode 3 (hybrid), transcript processing, live note-taking, drift detection with AI commentary, cross-practice connections, MCP server, OIDC/OAuth, PDF export, plugins.

### Phase 2: Expert Support + Auth

- **Mode 1 + Mode 3**: Expert-led and hybrid modes
- **Transcript import + Transcript Processor agent**
- **Preparation Brief Generator agent**
- **Draft-then-approve teaching moment curation**
- **Reviewer invitation and access**
- **OIDC/SSO + OAuth token flow**: Proper auth for both humans and agents

### Phase 3: Agent Platform + Maturity

- **MCP server**: Expose Resilience Companion as MCP server for external agent integration
- **Drift Analyst agent** + side-by-side comparison
- **Knowledge concentration tracking + contributor map**
- **Notifications** (email/webhook for staleness)
- **Cost tracking and token budgets**
- **PDF export**

### Phase 4: Ecosystem

- **Cross-practice connections** (link to chaos, load test, GameDay findings)
- **Plugin interface** for deep integrations (incident.io, CI/CD, service catalogs)

### Phase 5+: Multi-Practice Learning System

- Extend the architecture to the other four practices: **Load Testing, Chaos Engineering, GameDays, Incident Analysis**
- Each practice gets its own template, agent profiles, and facilitation modes — same patterns as ORR
- Teaching moment library becomes cross-practice (an incident analysis teaching moment surfaces during an ORR; a chaos experiment finding informs a GameDay scenario)
- Discoveries flow between practices: ORR gap → chaos experiment → incident finding → ORR update
- Dashboard expands to show the full learning system: are practices feeding each other? where are the disconnects?
- The tool becomes the book's vision made concrete: five practices as one interconnected learning system

---

## Resolved Decisions

1. **Live session capture**: Two options — live note-taking with AI assistance, or transcript import from existing meeting tools. No built-in audio/video. Teams choose what fits.

2. **Teaching moment curation**: Draft-then-approve. AI drafts candidate teaching moments, reviewer approves within a configurable window. Unapproved drafts stay in draft, not published.

3. **Multi-team ORRs**: One team per ORR. If a service is shared, one team owns the ORR and invites others as contributors.

4. **Authentication**: OIDC/SSO as the primary path (Okta, Azure AD, Google Workspace). Local username/password as fallback for small orgs or testing.

5. **API-first architecture**: Build the API first. Portal is a client of the API. MCP server is a thin adapter over the same API. One source of truth, three access patterns, same auth. No standalone chatbot — platform primitives that let agents do real work.

6. **Agent auth via OAuth**: Same OIDC provider as portal. No long-lived API keys. Tokens scoped, short-lived, tied to identity. Service accounts for automation.

7. **Name**: Resilience Companion. Final.
