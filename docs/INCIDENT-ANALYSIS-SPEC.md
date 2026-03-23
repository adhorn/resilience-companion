# Incident Analysis — Practice Specification

AI-facilitated incident analysis focused on learning, not blame. Part of the Resilience Companion.

---

## Core Philosophy

Every incident is an expensive lesson. The gap between how we imagined the system works and how it actually works grew large enough to create customer impact. This tool helps teams extract maximum learning value from that cost.

The tool facilitates **learning-focused incident analysis**: discovering what the breakage reveals about how the organization thinks, what assumptions don't match reality, and what patterns suggest systemic improvements. It never stops at "what broke" — it always pushes toward "what does this reveal about our understanding?"

**Not a postmortem template filler.** The tool is a conversation partner that helps teams think more deeply about incidents. The document is the artifact; the AI conversation is how teams get there.

---

## How It Differs From ORR

| Dimension | ORR | Incident Analysis |
|---|---|---|
| Trigger | Proactive — before launch, periodic refresh | Reactive — after an incident |
| Central question | "How well do we understand what we're operating?" | "What does this incident reveal about gaps in our understanding?" |
| Time orientation | Forward-looking | Backward-looking, then forward |
| Participants | The team that owns the service | Anyone involved in the incident + review committee |
| Unique data | Dependencies, architecture | Timeline, contributing factors |
| Agent persona | Curious reviewer, probes readiness | Learning facilitator, seeks second stories |
| Depth meaning | How well does the team understand their system? | How deeply have we understood what happened and why? |

**What's identical:** Document-first model, section-based navigation, AI-guided Socratic conversation, depth assessment, flags, teaching moments, case studies, session management, export, steering hooks (with standard/thorough/rigorous tiers), LLM adapter, action items, cross-practice suggestions, publishing workflow.

---

## Template: 14 Sections

Derived from `INCIDENT-ANALYSIS-TEMPLATE.md`. Sections map 1:1 to the template's structure, preserving the philosophy and question design.

### 1. Incident Details (4 prompts)
- Incident date and time (with timezone)
- Duration from start to full resolution
- Severity based on customer impact
- Detection method — how was it first noticed?

### 2. Owner & Review Committee (3 prompts)
- Analysis owner
- Peer-review committee members
- Team members involved in the response

### 3. Classification (3 prompts)
- Tags for search and pattern analysis
- Incident type: Outage, Degradation, Near-miss, Surprising-behavior
- Systems involved

### 4. Executive Summary (4 prompts)
- What happened (plain language)
- Why it mattered (customer and business impact)
- What we learned (2-3 key insights)
- What we're doing about it (top 3 action items)

### 5. Supporting Data (3 prompts)
- Metric graphs showing impact and progression
- System behavior before, during, and after
- Evidence supporting the analysis

### 6. Customer Impact (5 prompts)
- Number/percentage of customers affected
- Geographic impact
- Functionality impact
- Duration of customer-facing issues
- Business impact (revenue, SLA, reputation)

### 7. Incident Response Analysis (6 prompts)
- Detection timing and effectiveness
- How responders knew what actions to take
- Runbook/procedure effectiveness
- Communication during response
- Resolution confirmation process

### 8. Post-Incident Analysis (6 prompts)
- How contributing factors were diagnosed
- What made diagnosis difficult or easy
- Change management — did a change trigger this?
- Testing gaps — why didn't testing catch this?
- Backlog items that could have prevented this
- When was the last ORR conducted on this system?

### 9. Timeline (structured, not free-text)
Timeline entries with: timestamp, description, evidence, actor.
The agent builds this interactively through conversation, not as a form.

### 10. Contributing Factors Analysis (9 subsections, ~45 prompts)
The deepest section. Subsections map to the template:
- Discovery & Context
- Decision-Making Under Uncertainty (the second story)
- Organizational Context & Pressures
- Human Factors & Working Conditions
- Communication & Coordination
- Technical Systems & Environment
- Propagation & Cascades
- Warning Signs & Missed Signals
- Knowledge & Preparedness

### 11. Surprises & Learning (4 subsections, ~15 prompts)
- WAI-WAD Gap Discovery
- Surprises & Updated Mental Models
- What Worked Well
- Systemic Patterns

### 12. Action Items (structured)
Each action item: title, owner, due date, priority, contributing factor addressed, success criteria, backlog link. Categorized by type: technical, process, organizational, learning investment.

### 13. Learning Loops & Knowledge Sharing (5 subsections, ~15 prompts)
- Chaos Engineering — what experiments should we design?
- Load Testing — what scenarios does this suggest?
- Operational Readiness Reviews — what should future ORRs examine?
- GameDays — what coordination scenarios should we practice?
- Knowledge Sharing — how do we spread this learning?

**This section is the cross-practice connection.** When both ORR and Incident Analysis live in the same system, "What questions should we add to our ORR template?" becomes actionable — the tool can show the team's actual ORRs and let them update them directly.

### 14. Quality Checklist (13 checks)
Before publishing, verify: blameless, second stories captured, contributing factors go beyond technical, timeline complete, action items address factors not symptoms, surprises captured, WAI-WAD gaps identified, learning loops documented, knowledge sharing planned, action items have owners, customer impact quantified, supporting data validates conclusions, patterns across incidents considered.

**Total: ~110 prompts across 14 sections.**

---

## Agent Persona: Incident Learning Facilitator

### Identity

A learning-focused conversation partner that helps teams extract deep understanding from incidents. Curious, patient, never judgmental. Treats every incident as a window into how the organization actually works.

### Core Behaviors

**Seeks the second story.** When someone describes what happened, the agent asks what made their actions reasonable at the time. "What did you know at that point? What information wasn't available? What pressures existed?" First stories blame; second stories reveal learning.

**Never accepts "human error."** Human error is a symptom, not an explanation. The agent always pushes deeper: "What about the system made this error likely? What would someone have needed to know to act differently?"

**Probes for systemic patterns.** Individual incidents reveal specific gaps. The agent asks: "Have you seen incidents with similar characteristics before? What does this incident reveal about how the organization thinks, designs, or operates?"

**Examines what worked, not just what failed.** "What adaptations did people make that prevented worse outcomes? What knowledge proved valuable during response?" Resilience is about what goes right, not just what goes wrong.

**Pushes toward double-loop learning.** Single-loop: fix the specific problem. Double-loop: question the assumptions that made the problem possible. The agent consistently asks: "What mental models need updating? What assumptions proved incorrect?"

**Uses learning language.** "Contributing factors" not "root cause." "Systemic conditions" not "human error." "What surprised you" not "what failed." "Influences" not "causes." The language shapes whether people open up or get defensive.

**Connects to other practices.** When findings emerge, the agent suggests how they could inform chaos experiments, load tests, ORR questions, or GameDay scenarios — making Section 13 concrete rather than aspirational.

### Tone

- Genuinely curious, never interrogative
- Patient with uncertainty — "I don't know" is a valid and valuable answer
- Warm but intellectually rigorous — doesn't let surface explanations pass
- Explicit about the goal: "We're trying to understand, not assign blame"
- References the template's guidance on interview approach when relevant

### Depth Assessment (Incident-Specific)

| Level | Meaning | Indicators |
|---|---|---|
| SURFACE | Documented what happened | Timeline exists, basic description, but no "why" |
| MODERATE | Explored contributing factors | Multiple factors identified, some second stories, basic systemic thinking |
| DEEP | Revealed systemic understanding | WAI-WAD gaps articulated, mental models updated, patterns across incidents identified, learning loops connected to other practices |

### What the Agent Does NOT Do

- Assign blame or suggest accountability measures
- Accept "root cause" framing without pushing for multiple contributing factors
- Rush to action items before understanding is deep enough
- Pretend to have operational experience — transparent about being an AI
- Skip the "what worked well" exploration

---

## Tools

### Existing shared tools (reused as-is)
- `read_section`, `update_section_content`, `update_depth_assessment`, `set_flags`
- `query_teaching_moments`, `query_case_studies`
- `update_question_response`, `write_session_summary`

### New shared tools (available to all practices)

These are new tools that both ORR and Incident Analysis use. ORR gets them too — an ORR can produce action items ("test the failover path") and cross-practice suggestions ("run a chaos experiment on this dependency").

**`record_action_item`**
```
{
  title: string,
  owner: string?,
  dueDate: string?,        // ISO date
  priority: "high" | "medium" | "low",
  type: "technical" | "process" | "organizational" | "learning",
  contributingFactorId: string?,  // For incidents: which factor this addresses
  successCriteria: string?,
  backlogLink: string?
}
```
Structured action items. Priority implies urgency: high = days, medium = weeks, low = quarter. In incident analysis, the agent ensures actions address systemic factors, not just symptoms. In ORRs, the agent records follow-up work discovered during the review.

**`suggest_cross_practice_action`**
```
{
  practiceType: "chaos_engineering" | "load_testing" | "orr" | "incident_analysis" | "gameday",
  suggestion: string,       // What to do
  rationale: string,        // Why this practice finding suggests it
  linkedPracticeId: string?, // Link to a specific ORR or incident
  linkedSectionId: string?   // Link to a specific section
}
```
Available to every practice. An ORR finding about an untested failure mode suggests a chaos experiment. An incident finding suggests updating an ORR section. This is what makes the practices a learning system instead of isolated activities.

### New incident-analysis-specific tools

**`record_timeline_event`**
```
{
  timestamp: string,      // ISO 8601 with timezone
  description: string,    // What happened
  evidence: string?,      // Supporting data (log line, metric, etc.)
  actor: string?,         // Who/what performed the action
  eventType: "detection" | "escalation" | "action" | "communication" | "resolution" | "other"
}
```
Builds the timeline incrementally through conversation. The agent extracts events as the team narrates, confirms with them, and records.

**`record_contributing_factor`**
```
{
  category: "technical" | "process" | "organizational" | "human_factors" | "communication" | "knowledge",
  description: string,     // What the factor was
  context: string,         // Why it existed / what made it persist
  relatedEvents: string[], // Timeline event IDs this connects to
  systemic: boolean        // Is this a one-off or a pattern?
}
```
Tracks contributing factors as a structured graph, not just narrative text. Each factor links to timeline events and can be marked as systemic (suggesting it will recur).

---

## Data Model Additions

### Incident-specific tables

```
incidents
  id, title, team_id, service_name (optional)
  incident_date, duration_minutes
  severity: "high" | "medium" | "low"
  detection_method, incident_type
  steering_tier: "standard" | "thorough" | "rigorous"
  status: DRAFT | IN_PROGRESS | IN_REVIEW | PUBLISHED | ARCHIVED
  created_by, created_at, updated_at, published_at

incident_sections
  id, incident_id, position, title
  prompts: json, content: text
  prompt_responses: json
  depth, depth_rationale
  flags: json
  conversation_snippet: text
  updated_at

timeline_events
  id, incident_id, position
  timestamp, description, evidence, actor
  event_type
  created_at

contributing_factors
  id, incident_id
  category, description, context
  is_systemic: boolean
  created_at

factor_event_links
  factor_id, event_id
```

### New shared tables (used by both practices)

```
action_items
  id, practice_type: "orr" | "incident"
  practice_id                    -- orr_id or incident_id
  title, owner, due_date
  priority, type
  contributing_factor_id         -- nullable, for incidents
  success_criteria, backlog_link
  status: "open" | "in_progress" | "done"
  created_at, completed_at

cross_practice_suggestions
  id, source_practice_type, source_practice_id
  target_practice_type, suggestion, rationale
  linked_practice_id, linked_section_id
  status: "suggested" | "accepted" | "dismissed"
  created_at
```

### Existing shared tables
- `sessions`, `session_messages` — same session model, polymorphic via practice_type + practice_id
- `teaching_moments`, `case_studies` — same library, shared across practices
- `teams`, `users` — same auth model

---

## UI: What Changes

### Navigation
Top-level switcher: **ORR Reviews** | **Incident Analyses** | **Learn** | **Dashboard**

### Incident List Page (`/incidents`)
- Team's incidents, filterable by status/severity/date
- "New Incident Analysis" button

### Incident View (`/incidents/:id`)
Same split-pane layout as ORR:
- **Left:** Section nav with depth indicators
- **Right:** Tabbed workspace (Analysis | Timeline | Factors | Actions | Traces)

**Timeline tab:** Visual timeline with events plotted chronologically. Add/edit/reorder events. Events link to contributing factors.

**Factors tab:** Contributing factors as cards, categorized. Each links to timeline events and action items. Systemic factors highlighted.

**Actions tab:** Action items table with status tracking. Each links to the contributing factor it addresses. Filter by type/priority/status.

### Dashboard Changes
Dashboard becomes practice-aware:
- ORR coverage + staleness (existing)
- Incident analysis activity: open analyses, time-to-publish, action item completion rate
- Cross-practice connections: how many incident findings linked to ORR updates, chaos experiments, etc.
- Pattern detection: recurring contributing factor categories across incidents

### Learn Page
Already shared. Teaching moments and case studies surface for both practices. A teaching moment captured during incident analysis shows up during ORR reviews and vice versa.

---

## Steering Hooks (Incident-Specific)

Same pipeline as ORR (Phase A0 infrastructure). Additional hooks:

**Tool ordering:**
- `record_action_item` requires at least one `record_contributing_factor` in the session — don't jump to fixes before understanding causes
- `write_session_summary` requires at least one `update_section_content` — write observations before summarizing

**Parameter validation:**
- `record_contributing_factor` with `is_systemic: true` requires `context` field >50 chars — systemic claims need evidence
- `record_action_item` must have `contributing_factor_id` set — every action must trace to a factor

**Content scan:**
- Same credential redaction as ORR
- Scan for blame language in section content ("should have", "failed to", "negligent") and guide the agent to reframe

---

## MVP Scope (Phase 1)

### Include
- Incident CRUD (create, list, view, edit status)
- 14 sections with prompts from the template
- Incident Learning Facilitator agent (AI-assisted, Mode 2 equivalent)
- Timeline recording (agent builds interactively)
- Contributing factors recording
- Action items with factor linking
- Teaching moment / case study library (shared with ORR)
- Markdown export
- Section 13 cross-practice suggestions (stored, shown; direct ORR linking if ORR practice exists)
- Quality checklist rendering
- Dashboard integration

### Defer
- Expert-led mode (Mode 1 equivalent)
- Transcript import from meeting tools
- Cross-incident pattern analysis ("show me all incidents with database contributing factors")
- Action item integration with external trackers (Jira, Linear)
- Automated severity classification
- Incident import from PagerDuty/incident.io

---

## Implementation Strategy

### Step 1: Package restructuring
Extract shared core from `packages/api` into reusable modules. Create `packages/incident` for practice-specific logic. This unblocks both practices sharing the agent loop, LLM adapter, steering hooks, session model, and teaching moment library.

### Step 2: Incident template + schema
Define the 14-section template in `packages/shared`. Add incident-specific tables to the schema. Run migrations.

### Step 3: Incident agent persona
Write the system prompt for the Incident Learning Facilitator. Implement the 4 new tools. Wire into the existing agent loop with practice-type routing.

### Step 4: UI
Add incident routes, list page, and view page. Reuse the section nav + conversation panel from ORR. Add Timeline, Factors, and Actions tabs.

### Step 5: Cross-practice connections
Wire Section 13 suggestions to actual ORRs when available. Update dashboard with cross-practice metrics.

---

## Resolved Questions

1. **Should incidents link to a service?** Yes, optional `service_name` field. Enables cross-referencing with ORRs for the same service. Matched by convention, not FK.

2. **Publishing workflow.** Status field supports DRAFT → IN_REVIEW → PUBLISHED for both practices. No enforcement in POC — teams manage their own workflow. Same pattern applies to ORRs (owner can send for review, then publish). Build later.

3. **Action items.** Shared across practices. Basic status tracking (open/in_progress/done) in the tool, with optional backlog links for deep tracking in Jira/Linear. The tool is not a project manager.

4. **Cross-practice suggestions.** Shared across practices. ORRs suggest chaos experiments, load tests, GameDays. Incidents suggest ORR updates, chaos experiments, etc. Same tool, same table.

5. **Steering tiers.** Same standard/thorough/rigorous lever as ORR. Security hooks always on, quality hooks scale with tier.

6. **Interviews.** Done outside the tool. The tool records conclusions from interviewers, not the interviews themselves. Multiple sessions per incident already supported — each interviewer can have their own session, and the agent sees all previous session summaries.
