# Service Hub — Specification

## Problem

The Resilience Companion currently treats services as a text field — `serviceName` on ORRs and incidents. But every practice in the book orbits around services: ORRs assess them, incidents happen to them, chaos experiments test them, load tests stress them, gamedays exercise the team that operates them.

Without a first-class service entity, we can't:
- Show a unified view of a service's resilience posture
- Track experiment suggestions from ORRs and incidents against the same service
- Correlate findings across practices ("the ORR flagged single-AZ Redis, and then an incident proved it")
- Answer "what has this team validated about this service, and what haven't they?"

## Core Concept

A **Service** is the central entity that connects all practices:

```
                         Service
                            │
          ┌─────────┬───────┼───────┬──────────┐
          │         │       │       │          │
     Service ORR  Feature  Incidents  Experiments  Action
       (1+)       ORRs      (0+)     & Tests     Items
                  (0+)                 (0+)       (0+)
```

Each practice feeds observations into the service and can suggest work for other practices. The service view becomes the team's operational home for that service.

## Service Entity

### What is a service?

A service is a thing the team operates. It has a name, an owner team, and it accumulates resilience artifacts over time. Services are created implicitly (first ORR or incident creates one) or explicitly.

### Data Model

```
services
  id            TEXT PRIMARY KEY
  name          TEXT NOT NULL
  team_id       TEXT NOT NULL (FK teams.id)
  description   TEXT                        -- optional, free-text
  created_at    TEXT NOT NULL
  updated_at    TEXT NOT NULL

  UNIQUE(team_id, name)
```

Existing tables get a `service_id` FK:
- `orrs.service_id` (replaces `serviceName`)
- `incidents.service_id` (replaces `serviceName`)

Migration: auto-create service records from distinct `(teamId, serviceName)` pairs, backfill FKs.

## Experiment Suggestions

### The Problem with "Test Everything"

An ORR might uncover 20 things that haven't been tested. Suggesting all 20 as experiments is useless — teams have limited time and need to focus where it matters most. The AI needs to prioritize.

### Prioritization Signal

The AI already collects the signal it needs during the review:

| Signal | What it tells us | Example |
|--------|-----------------|---------|
| **Untested failure modes** | Gap between claimed resilience and validated resilience | "We have circuit breakers" but never tested what happens when they trip |
| **Large blast radius** | High-impact areas that haven't been stress-tested | A dependency failure that takes down all customer-facing features |
| **Hedging language** | Low confidence areas the team isn't sure about | "I think the retry logic handles that" / "It should scale to that" |
| **Shallow depth assessment** | Areas explored only at SURFACE level | Scaling section answered with "we auto-scale" and nothing deeper |
| **Flags: AT_RISK or NEEDS_WORK** | Explicitly flagged concerns | Monitoring flagged as NEEDS_WORK, DR flagged as AT_RISK |
| **Single points of failure** | Architectural risks with no redundancy | Single-AZ database, single deployment region |
| **Assumption gaps** | Things the team assumes but hasn't validated | "Our dependency's SLA covers our needs" but never measured actual availability |
| **Incident patterns** | Recurring failure categories from past incidents | Third incident involving the same dependency timeout |

### Suggestion Types

Each suggestion maps to a practice from the book:

| Type | What it validates | When to suggest |
|------|------------------|-----------------|
| **Chaos experiment** | "Does this failure mode behave the way we think?" | Untested failure mode, unvalidated resilience mechanism, hedging about failure behavior |
| **Load test** | "Does this scale the way we think?" | Unvalidated scaling claims, unknown capacity limits, new traffic patterns from feature changes |
| **Gameday** | "Can the team respond to this scenario?" | Untested DR procedures, unclear escalation paths, runbooks that haven't been exercised |

### Suggestion Model

```
experiment_suggestions
  id                  TEXT PRIMARY KEY
  service_id          TEXT NOT NULL (FK services.id)
  source_practice     TEXT NOT NULL           -- 'orr' | 'feature_orr' | 'incident'
  source_id           TEXT NOT NULL           -- FK to the originating ORR or incident
  source_section_id   TEXT                    -- which section triggered the suggestion
  type                TEXT NOT NULL           -- 'chaos_experiment' | 'load_test' | 'gameday'
  title               TEXT NOT NULL           -- short description
  hypothesis          TEXT NOT NULL           -- what you expect to happen
  rationale           TEXT NOT NULL           -- why this matters, referencing ORR/incident findings
  priority            TEXT NOT NULL           -- 'critical' | 'high' | 'medium' | 'low'
  priority_reasoning  TEXT NOT NULL           -- why this priority (blast radius, confidence gap, etc.)
  blast_radius_notes  TEXT                    -- what's at stake if the hypothesis is wrong
  status              TEXT NOT NULL DEFAULT 'suggested'  -- suggested | accepted | scheduled | completed | dismissed
  dismissed_reason    TEXT                    -- if dismissed, why (already covered, not applicable, etc.)
  completed_at        TEXT
  completed_notes     TEXT                    -- what was learned
  created_at          TEXT NOT NULL
  updated_at          TEXT NOT NULL
```

### How Suggestions Are Generated

The AI generates suggestions as part of the review conversation, using a new tool:

**`suggest_experiment`** — available to both ORR and incident analysis agents

```
Parameters:
  type:               'chaos_experiment' | 'load_test' | 'gameday'
  title:              string
  hypothesis:         string  -- "We expect that when [trigger], [expected behavior]"
  rationale:          string  -- references specific ORR/incident findings
  priority:           'critical' | 'high' | 'medium' | 'low'
  priority_reasoning: string  -- why this priority level
  blast_radius_notes: string  -- what's at risk
```

The AI calls this tool when it identifies a validation gap during conversation. It doesn't dump all suggestions at the end — it weaves them in naturally:

> "You mentioned the payment service fails closed when Stripe is unavailable, but you haven't tested that in a controlled way. I'd suggest a chaos experiment: inject Stripe unavailability and verify the checkout flow degrades gracefully without losing orders. Given that this affects all paying customers, I'd rate this as high priority."

### Priority Logic

The agent uses these heuristics (encoded in the system prompt, not hardcoded):

**Critical** — Unvalidated assumption + large blast radius + customer-facing impact
- "You've never tested AZ failover and your service handles all payment processing"

**High** — Untested failure mode with significant blast radius, or recurring incident pattern
- "Circuit breakers exist but have never been tripped in a controlled test"
- "Third incident this quarter involving dependency timeouts"

**Medium** — Known gap with moderate impact, or low-confidence area
- "Scaling claim based on estimates, not load testing"
- "DR procedure documented but never exercised"

**Low** — Minor gap, or already partially covered
- "Edge case failure mode with narrow blast radius"
- "Monitoring exists but alerting thresholds haven't been tuned"

### Suggestion Lifecycle

```
suggested → accepted → scheduled → completed
                ↘ dismissed (with reason)
```

- **Suggested**: AI generated during review, appears on service view
- **Accepted**: Team agrees this is worth doing
- **Scheduled**: Team has committed to a date/sprint (free-text, not calendar integration)
- **Completed**: Done — team records what they learned (this feeds back into future reviews)
- **Dismissed**: Not doing it — reason captured for context ("already covered by X", "risk accepted", etc.)

When a suggestion is completed, its learnings become available context for future ORR and incident sessions on that service. The AI can reference them: "You completed a chaos experiment on Stripe failover last month — walk me through what you learned. Has anything changed since then?"

## Service View

The service page becomes the team's resilience dashboard for that service:

### Header
- Service name, team, description
- Quick stats: last ORR date, open incidents, pending suggestions

### Tabs

**Overview** — Service health at a glance
- Latest Service ORR status + depth summary
- Recent Feature ORRs (last 5)
- Open incidents
- Experiment suggestions by priority

**ORR History** — All ORRs for this service
- Service ORR (current + past versions)
- Feature ORRs (linked to parent)
- Timeline view showing ORR cadence

**Incidents** — All incidents for this service
- Sorted by date
- Contributing factors and action items
- Cross-practice suggestions from incidents

**Experiments & Tests** — Suggested, planned, and completed
- Grouped by type (chaos / load test / gameday)
- Sorted by priority within each group
- Completed experiments with learnings
- Dismissed with reasons

**Action Items** — Cross-cutting
- From ORRs, Feature ORRs, incidents
- Status tracking
- Links back to source

## Cross-Practice Intelligence

The real power is connecting findings across practices:

### ORR → Experiment Suggestions
As described above. The AI suggests experiments during the review.

### Incident → Experiment Suggestions
After incident analysis, the AI suggests experiments to validate fixes:
- "The contributing factor was an untested failover path — suggest a chaos experiment to validate it now that it's been fixed"
- "Load spike was the trigger — suggest a load test at 2x the level that caused the incident"

### Experiment Results → ORR Context
When a team completes an experiment, those learnings become context for the next ORR:
- "In your chaos experiment last month, you discovered the circuit breaker takes 30s to trip. Has that been tuned?"
- "Your load test showed the service handles 3x traffic but the database connection pool saturates at 2.5x. Has that been addressed?"

### Incident → ORR Staleness
When an incident occurs for a service, the Service ORR's relevant sections should be flagged for re-review:
- Incident in payment processing → Architecture and Failures sections may need revisiting
- Incident revealing monitoring gaps → Monitoring section flagged

### Feature ORR → Experiment Inheritance
Feature ORRs can inherit relevant experiment suggestions from the parent service:
- "The Service ORR suggested a chaos experiment on database failover. Your feature adds a new write path — does this change the experiment scope?"

## Agent Behavior Changes

### System Prompt Additions

Both ORR and incident analysis agents receive:
- The service's experiment history (completed experiments + learnings)
- Pending experiment suggestions (so the agent doesn't re-suggest)
- Recent incidents for the service (pattern detection)
- Current ORR depth assessments (for gap identification)

### When to Suggest

The agent should suggest experiments when:
1. A team claims resilience but hasn't validated it ("we have circuit breakers" + no test evidence)
2. Blast radius is high and failure mode is untested
3. The team uses hedging language about system behavior
4. A depth assessment stays at SURFACE for a critical area
5. An incident reveals a gap that should be prevented from recurring
6. A feature change introduces new failure modes not covered by existing tests

The agent should NOT suggest experiments for:
1. Areas already covered by completed experiments (unless findings are stale)
2. Low-risk, low-blast-radius scenarios (unless there are no higher-priority items)
3. Things the team has explicitly accepted risk on (reference dismissed suggestions)

### Prioritization in Conversation

The agent should rank suggestions during the review, not after. When wrapping up a section:

> "Based on what we discussed in this section, I'd flag two experiments worth considering. The highest priority is testing your Stripe failover — the blast radius covers all paying customers and you haven't validated the fail-closed behavior. Second, a load test at your projected Black Friday traffic — your scaling model is based on estimates, not measurements."

## Implementation Phases

### Phase 1: Service Entity + Basic Suggestions

- Create `services` table, migrate existing `serviceName` fields
- Service auto-creation from ORR/incident creation
- `suggest_experiment` tool for ORR and incident agents
- `experiment_suggestions` table
- Basic service view (list of ORRs, incidents, suggestions)
- Agent system prompt updated with suggestion guidelines

### Phase 2: Suggestion Lifecycle + Service View

- Suggestion status management (accept/schedule/complete/dismiss)
- Completed experiment learnings capture
- Full service view with tabs
- Experiment learnings fed back as agent context
- Incident → ORR staleness flagging

### Phase 3: Cross-Practice Intelligence

- Experiment results → future ORR context
- Incident patterns → experiment suggestions
- Feature ORR → experiment scope changes
- Service health scoring based on validated vs unvalidated assumptions

## Data Model Summary

### New Tables
- `services` — first-class service entity
- `experiment_suggestions` — chaos, load test, gameday suggestions with priority and lifecycle

### Modified Tables
- `orrs` — add `service_id` FK (keep `serviceName` temporarily for migration)
- `incidents` — add `service_id` FK (keep `serviceName` temporarily for migration)

### New Agent Tool
- `suggest_experiment` — shared tool available to all practice agents

## Open Questions

1. **Should experiment suggestions link to specific ORR prompts?** When the AI suggests a chaos experiment because of an answer to "Walk me through what happens during an AZ failure", should the suggestion reference that specific prompt? Leaning yes — it makes the rationale traceable.

2. **How do we handle services that span teams?** Platform services are consumed by many teams. Should services be team-scoped (each team has their own view of the same service) or shared? Leaning team-scoped for simplicity — each team's ORR reflects their understanding of the service from their perspective.

3. **Should completed experiments auto-update ORR depth assessments?** If a team completes a chaos experiment that covers a SURFACE-level area, should the depth bump to MODERATE automatically? Leaning no — the experiment validates one thing, depth assessment reflects overall coverage. But the AI should reference it and suggest the team consider updating depth.
