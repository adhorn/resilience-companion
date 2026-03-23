# Feature ORR — Specification

## Problem

The current ORR is designed for new service launches: 11 sections, 107 prompts, deep exploration. It's the right tool when a service is going to production for the first time.

But most operational changes aren't new services. They're features added to existing services: a new external dependency, a new API endpoint, a data model migration, a scaling architecture change. These changes need operational readiness review too — but forcing teams through 107 prompts for a feature addition is overhead that kills adoption.

At the same time, a feature change can't be reviewed in isolation. Adding an external dependency to a service with circuit breakers is different from adding one to a service without them. The feature ORR needs to know what the service already has in place.

## Core Concept

A Feature ORR is a lightweight, change-scoped operational readiness review that:

1. **Assesses the new surface area** — Is the new thing itself operationally ready? (monitoring, failure modes, rollback, testing)
2. **Checks for impact on existing assumptions** — Does this change invalidate anything the service ORR established? (capacity, dependencies, failure domains, SLAs)
3. **Inherits context from the parent** — The AI sees the service ORR's answers and can reference them, compare, and flag conflicts

## ORR Types

When creating an ORR, the user chooses:

| Type | When to use | Template | Parent |
|------|------------|----------|--------|
| **Service ORR** | New service going to production | Full (11 sections, 107 prompts) | None |
| **Feature ORR** | Adding/changing a feature on an existing service | Change-scoped (varies) | Links to a Service ORR |

A Feature ORR without a parent is allowed (the service may not have been ORR'd yet) — it just won't have inherited context. The AI should note this gap.

## Creation Flow

### Step 1: Select ORR Type

```
What kind of review?

[Service ORR]     — Full review for a new service
[Feature ORR]     — Lighter review for a change to an existing service
```

### Step 2 (Feature ORR): Describe the Change

**Service**: Select from team's existing services (autocomplete from previous ORRs), or type a new name.

**Parent ORR** (optional): If the service has completed ORRs, show them. User picks one (or "None — this service hasn't been reviewed yet").

**Change description**: Free-text. "Adding Stripe as a payment dependency", "Migrating user table from Postgres to DynamoDB", "New public API for partner integrations".

**Change types** (optional, multi-select — shortcuts for seeding relevant questions):

The change description is the primary input. Change type tags are optional shortcuts that pre-select relevant questions. The predefined tags are:

- **New dependency** — Adding an external service, API, or data source
- **New endpoint / API** — Exposing new functionality to customers or partners
- **Data model change** — Schema migration, new storage, data flow change
- **Scaling change** — New scaling dimension, capacity model change, region expansion
- **Infrastructure change** — Moving to different compute, networking changes, new deployment target
- **Security boundary change** — Auth model change, new trust boundary, data classification change
- **Failure domain change** — New blast radius, changed isolation boundaries

Tags are not gates — a change with no tags still gets the universal questions plus whatever the user adds manually. Teams can also create custom tags ("regulatory change", "vendor migration", etc.) that map to their own question sets. The system should also suggest tags based on the change description (e.g., mentioning "Stripe" suggests "New dependency"), but the user always has final say.

Multiple selections are common ("Adding Stripe" is both "New dependency" and potentially "New endpoint").

### Step 3: Review Questions

The system generates a question set based on selected change types (see Question Selection below). The user sees:

```
Based on your change types, here are the recommended questions (23 questions across 6 sections):

[✓] Architecture (5 questions)
    [✓] How does the new component integrate with your existing architecture?
    [✓] What failure modes does the new component introduce?
    [ ] How does this change your scaling characteristics?  ← user unchecked
    ...

[✓] Monitoring (4 questions)
    ...

[+] Add custom question to [section ▾]
```

The user can:
- **Uncheck** questions that don't apply
- **Add custom questions** to any section
- **Add an entire custom section** with custom questions

This becomes the Feature ORR's template — persisted per-ORR, not modifying the global template.

## Question Selection

### Change Type → Question Mapping

Each question in the system has **change-type tags** indicating when it's relevant. Questions come from three sources:

#### 1. Impact Questions (derived from parent ORR sections)

These ask "does the change affect what you previously established?" They're auto-generated based on what the parent ORR covers.

For each parent ORR section with content, generate an impact question:

| Parent section | Impact question |
|---------------|----------------|
| Architecture | "Walk me through how this change fits into your existing architecture. What component interactions change? Where does this sit relative to your existing failure domains?" |
| Failures & Adaptive Capacity | "Walk me through the failure modes this change introduces. How do they interact with your existing resilience mechanisms — circuit breakers, retries, timeouts? What breaks differently now?" |
| Monitoring | "What new signals do you need to watch? Walk me through how your existing dashboards and alarms change — what gaps open up?" |
| Deployment | "How does this change affect your deployment pipeline? Walk me through what a rollback looks like now compared to before." |
| Operations | "Walk me through what changes for on-call. Do runbooks need updating? Does the escalation path change? What does a 3am page look like with this change in place?" |
| Disaster Recovery | "How does this change affect your disaster recovery story? Walk me through RTO/RPO — do the numbers still hold? What about failover procedures?" |

Impact questions are always included by default (user can uncheck). The parent ORR's content for that section is shown as read-only context.

#### 2. Readiness Questions (from the feature template)

These ask "is the new thing ready?" They're specific to the change type.

**New Dependency:**
- Describe the new dependency and why you need it. What alternatives did you consider?
- Walk me through what happens when this dependency is unavailable. Does your service fail-open or fail-closed? What does the customer see?
- What is the SLA/SLO of this dependency? How does it compare to your own service's targets? What happens to your error budget math?
- Walk me through your timeout, retry, and backoff strategy for this dependency. How did you pick those numbers?
- What rate limits or quotas does this dependency impose? How do you track usage against limits, and what happens as you approach them?
- Show me how you monitor the health and latency of this dependency. What does your dashboard look like? What alerts exist?
- Walk me through the blast radius if this dependency goes down. Which customer-facing features are affected? Which aren't?
- Do you have a fallback or degraded mode? Walk me through what the service looks like with this dependency down — what still works?
- How do you test this dependency's failure modes? Have you actually killed it in a test environment and watched what happens?
- What data does this dependency have access to? Walk me through the security implications and data flow.

**New Endpoint / API:**
- Describe the new endpoint and who consumes it. Walk me through a typical request flow end to end.
- What request volumes do you expect? Walk me through how you arrived at those numbers and what your latency targets are.
- Walk me through how the endpoint is authenticated and authorized. What happens when someone sends a request with bad credentials?
- What rate limiting and throttling is in place? Walk me through what happens when a consumer hits limits — what do they see?
- Walk me through your input validation. What happens with malformed requests? What about intentionally malicious input?
- Show me how you monitor this endpoint's availability and latency. What alerts fire, and when?
- Walk me through the rollback plan if this endpoint has problems after launch. Can you turn it off without affecting the rest of the service?
- How do consumers learn about this endpoint? Walk me through the documentation and versioning story.

**Data Model Change:**
- Describe what's changing in the data model and why. Walk me through the before and after.
- Walk me through your migration strategy. Is it online or offline? Rolling or big-bang? What drove that choice?
- Walk me through the rollback plan if the migration fails mid-way. What state is the data in? Can you recover?
- How do you handle the transition period where old and new schemas coexist? Walk me through what happens to in-flight requests during migration.
- What's the expected data volume? Walk me through how the migration scales — what happens with your largest tables?
- How do you validate data integrity after migration? Walk me through your validation process and what happens if something doesn't match.
- What downstream systems or consumers are affected by this schema change? Walk me through who else reads this data.
- Walk me through your backup strategy before migration begins. When did you last restore from a backup to verify it works?

**Scaling Change:**
- Describe the new scaling dimension or capacity model. Walk me through what changes and why.
- What triggers scaling and what are the new limits? Walk me through the boundary conditions — what happens at the edges?
- How do you test the new scaling behavior under load? Walk me through your load testing plan and what you're watching for.
- Walk me through what happens when scaling hits its limits. What's the degradation path? What does the customer experience?
- How does this affect your cost model? Walk me through the economics — any surprises?
- Show me the monitoring that tells you scaling is working as expected. What signals would tell you it's not?

**Infrastructure Change:**
- Describe what infrastructure is changing and why. What are you moving from and to?
- Walk me through the migration or transition plan. What's the sequence? Where are the points of no return?
- Walk me through the rollback plan. How far into the transition can you still go back? What happens if you need to roll back after the point of no return?
- How do you validate the new infrastructure before cutting over? Walk me through your confidence-building steps.
- What monitoring gaps exist during the transition? Walk me through the period where you're between old and new — what can you see, what can't you see?
- How does this affect your disaster recovery posture? Walk me through DR with the new infrastructure — does everything still work?

**Security Boundary Change:**
- Describe what trust boundary is changing. Walk me through the before and after — who could access what, and who can now?
- How do you validate the new security model before deployment? Walk me through your verification approach.
- Walk me through the blast radius if the new security boundary is misconfigured. What's the worst case? What data is exposed?
- What audit logging exists for the new boundary? Show me what you'd look at if you suspected unauthorized access.
- How does this affect your compliance posture? Walk me through which compliance requirements are affected and how you'll demonstrate adherence.

**Failure Domain Change:**
- Describe what isolation boundary is changing. Walk me through the failure domains before and after.
- How have you validated the new blast radius? Walk me through your testing — have you actually failed components within the new boundaries?
- Walk me through what happens if the isolation fails. What's the worst-case impact? Who gets affected that wasn't affected before?
- How do you test the new failure domain boundaries? Walk me through how you know the isolation actually works.
- Does this affect your multi-AZ or multi-region story? Walk me through how this change interacts with your availability architecture.

#### 3. Universal Questions (always included)

These appear on every Feature ORR regardless of change type:

- Walk me through your rollback plan if this change causes problems in production. How long does it take? What state is the system in mid-rollback?
- How will you validate this change in production before full rollout? Walk me through your canary, feature flag, or progressive deployment strategy.
- What's your confidence level in the monitoring for this change? Walk me through the blind spots — what could go wrong that you wouldn't see?
- What could go wrong that you haven't considered? What assumptions are you making that you haven't validated?
- Who needs to know about this change? Walk me through the communication — dependent teams, on-call, support. What happens if they're surprised by it?

### Question Customization (Team-Level)

Teams can customize the question pool over time:

- **Disable questions globally** — "We never need the certificate question"
- **Add team-specific questions** — "Does this comply with our PCI requirements?"
- **Set per-change-type defaults** — "For new dependencies, always include our vendor risk checklist"

Team customizations are stored in a `team_orr_config` table, not in the template itself. The template remains the curated default.

## Parent ORR Context

When a Feature ORR has a parent, the AI agent has access to:

- **Parent ORR sections and answers** — read-only, surfaced as context
- **Parent ORR depth assessments** — knows which areas were explored deeply vs superficially
- **Parent ORR flags** — knows existing risks, gaps, and strengths

The agent uses this to:

1. **Reference existing answers**: "Your service ORR mentions circuit breakers on all external calls — does the new Stripe integration use the same circuit breaker library?"
2. **Flag potential conflicts**: "Your service ORR says the retry budget is 3 retries with exponential backoff, but Stripe recommends idempotency keys instead of retries for payment calls."
3. **Identify inherited risks**: "The parent ORR flagged single-AZ Redis as a risk — does your new feature depend on Redis?"
4. **Suggest parent updates**: "Based on what we learned about the Stripe integration, the Architecture section of the parent ORR should be updated to include this new dependency."

### Parent Update Suggestions

When the Feature ORR reveals something that affects the parent, the agent can create a **cross-practice suggestion** (reusing the existing mechanism):

```
source: feature-orr/{featureOrrId}
target: orr/{parentOrrId}
suggestion: "Update Architecture section to include Stripe as a critical payment dependency"
rationale: "Feature ORR for Stripe integration revealed this is a Tier 1 dependency affecting checkout flow"
```

These appear in the parent ORR's dashboard as pending updates.

## Data Model Changes

### `orrs` table additions

```
orr_type        TEXT NOT NULL DEFAULT 'service'   -- 'service' | 'feature'
parent_orr_id   TEXT                              -- FK to orrs.id (null for service ORRs)
change_types    TEXT NOT NULL DEFAULT '[]'        -- JSON array of change type tags
change_description TEXT                           -- free-text description of the change
```

### `templates` table additions

No changes to the global template table. Feature ORR questions are generated at creation time and stored in the ORR's sections (the existing `prompts` JSON field on each section).

### New: `team_orr_config` table

```
team_id             TEXT NOT NULL (FK teams.id)
disabled_questions  TEXT NOT NULL DEFAULT '[]'    -- JSON array of question IDs
custom_questions    TEXT NOT NULL DEFAULT '[]'    -- JSON array of {section, question, changeTypes[]}
change_type_defaults TEXT NOT NULL DEFAULT '{}'   -- JSON map of changeType → additional question IDs
```

## UI Changes

### Create ORR Page

Replace single-step creation with multi-step:

1. **Type selection**: Service ORR vs Feature ORR (cards)
2. **Details**: Service name + (for feature) parent ORR selector, change description, change type tags
3. **Question review**: Checklist of generated questions, with ability to add/remove/reorder

### Feature ORR View

Same split-pane layout as service ORR, with additions:

- **Parent context panel**: collapsible panel showing relevant parent ORR answers for the active section
- **Impact indicators**: visual markers on sections where the parent ORR had content (showing what might be affected)
- **"Suggest parent update" action**: button that creates a cross-practice suggestion to update the parent ORR

### Service ORR View

- **Feature ORR list**: shows child Feature ORRs linked to this service ORR
- **Pending updates**: shows suggestions from Feature ORRs that might require parent updates

## Agent Behavior

The Feature ORR agent uses the same Review Facilitator persona but with adjusted behavior:

- **Shorter sessions**: Feature ORRs should complete in 15-30 min, not 60-90
- **More focused probing**: Asks about the specific change, not the whole service
- **Parent-aware**: References parent ORR context, flags conflicts
- **Suggests parent updates**: When findings affect the service ORR
- **Lighter depth criteria**: SURFACE/MODERATE/DEEP thresholds adjusted for feature scope

### System Prompt Additions

The agent receives:
- The Feature ORR's change description and change types
- The parent ORR's section summaries (if linked)
- The parent ORR's active section content (when the corresponding section is being discussed)

## Implementation Phases

### Phase 1: Core Feature ORR

- ORR type selection at creation
- Change type tags + description
- Feature ORR template generation (change-type → questions mapping)
- Question review/customization at creation time
- Parent ORR linking (read-only context)
- Agent system prompt updated with parent context

### Phase 2: Parent-Child Interaction

- Parent update suggestions from Feature ORR
- Feature ORR list on Service ORR view
- Parent context panel in Feature ORR view
- Impact indicators

### Phase 3: Team Customization

- Team-level question config (disable/add/defaults)
- Question management UI
- Per-team change-type defaults

## Open Questions

1. ~~**Should Feature ORRs version-lock the parent?**~~ No — always latest. Feature ORRs that reference an outdated parent are flagged as stale, same as the existing staleness mechanism.

2. ~~**How do Feature ORRs affect the dashboard?**~~ Yes, they count. The dashboard can surface services with many Feature ORRs (signals high change velocity). We can also graph the Service ORR → Feature ORR relationships visually, similar to how we graph dependencies in the UI.

3. ~~**Can a Feature ORR become a Service ORR?**~~ No — keep them separate. But we need the ability to **stop an ORR mid-way** by giving a reason (applies to both Service and Feature ORRs). When reopening a stopped ORR, the reason for stopping is captured, and the conversation resumes from where it left off — same session, same context.

4. ~~**Should change types be extensible per-org?**~~ Yes — resolved. Custom tags are supported, and change types are optional shortcuts, not gates.
