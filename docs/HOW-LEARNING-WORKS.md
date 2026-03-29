# How Learning Works: The Life of a Message

This document traces what happens when a team member sends a message to the AI facilitator, and how learning signals get captured at each step.

## The Journey

```
Team member types a message
       |
       v
  [1] SEND — message goes to the API via SSE stream
       |
       v
  [2] CONTEXT — agent loads everything it knows about this review
       |
       v
  [3] PROMPT — system prompt tells the agent how to facilitate learning
       |
       v
  [4] THINK — LLM reads the message in context of what's been discussed
       |
       v
  [5] ACT — agent calls tools to capture what it's observing
       |         |         |         |         |
       v         v         v         v         v
   Record     Assess    Set       Record    Update
   Answer     Depth     Flags     Discovery Question
       |
       v
  [6] RESPOND — agent replies with a follow-up question or observation
       |
       v
  [7] STREAM — response + tool results flow back to the UI in real-time
       |
       v
  [8] PERSIST — everything is stored for future sessions and the Learning tab
```

## Step by Step

### 1. Send

The frontend sends the message to `POST /api/v1/{practice}/{id}/sessions/{sessionId}/messages`. Before reaching the agent, the backend checks:

- **Deduplication**: Is this the same message we just received? (prevents double-submit)
- **Token budget**: Has the team hit the daily limit?
- **Session renewal**: Has this session used too many tokens? If so, flush a summary, create a new session, and carry forward the last 20 messages. The team never notices — the conversation continues seamlessly.

The user message is persisted to the `sessionMessages` table before the agent sees it.

### 2. Context

The agent doesn't start from scratch. Before every turn, the system assembles everything it knows:

**For the active section (full detail):**
- All prompts and which ones have answers
- Which answers came from team memory vs. from reading source code
- Current depth assessment and rationale
- All flags (RISK, GAP, STRENGTH, FOLLOW_UP)

**For every other section (summary):**
- Depth level, flag counts, question coverage
- Last conversation note
- This lets the agent spot cross-section patterns without re-reading everything

**Session history:**
- Summaries from all prior completed sessions
- Whether this is a returning session (first session vs. subsequent)

**Teaching moments and case studies:**
- Matched by section tags — real-world incidents relevant to what's being discussed

### 3. Prompt

The system prompt is where learning science meets AI facilitation. It teaches the agent *how* to probe for understanding, not just *what* to ask.

**Socratic method — four probing strategies:**

| Strategy | What the agent does | Learning signal it produces |
|----------|--------------------|-----------------------------|
| **Predict first** | "Before we look at the docs, what do you think happens when this fails?" | Prediction accuracy reveals WAI-WAD gap |
| **Generate before comparing** | "From memory, what's the retry logic?" | Gap between recall and reality = depth signal |
| **Trace the path** | "Walk me through the request path when the primary fails" | Vague = surface; step-by-step with specifics = deep |
| **Ask for the why** | "Why is the timeout set to 5 seconds?" | Can't explain design reasoning = surface understanding |

**Depth assessment framework — what each level means:**

- **Surface**: Team recognizes terms, recites documentation, can't predict beyond documented failures. Confident but hollow.
- **Moderate**: Team answers with specifics for known scenarios, traces paths, explains some design reasoning. Accurate but bounded.
- **Deep**: Team predicts novel failure modes, explains *why* designs work, connects patterns across sections, actively identifies their own blind spots. Generates, doesn't just recall.

The agent must cite specific indicators when assessing depth — not "the team seems knowledgeable" but "the team traced the failover path accurately and predicted the retry storm scenario, but couldn't explain why the timeout was chosen."

**Discovery triggers — when to capture a learning moment:**

The prompt tells the agent to call `record_discovery` immediately when it detects:
- **Surprise**: "I didn't know that", "wait, really?"
- **Wrong prediction**: "I thought it would fail gracefully but..."
- **WAI-WAD gap**: Difference between how the team thinks the system works and how it actually behaves
- **Blind spot**: Team can't answer from memory, or explicitly says "I don't know"

With a specificity requirement: not "learned about architecture" but "discovered retry logic has no jitter, risking thundering herd at scale."

**Returning session check-in:**

When a team returns for a second or third session, the agent doesn't read back prior summaries. It asks the team to recall what was covered. Their recall accuracy is itself a learning signal — it reveals how much transferred from the previous session.

### 4. Think

The LLM receives the full context, system prompt, conversation history, and the new message. It decides:

- Is the team's answer substantive enough to record?
- Does this reveal something about their depth of understanding?
- Is there a surprise, gap, or strength worth flagging?
- What's the best follow-up question to probe deeper?

This is where the Socratic method meets the specific team's answers. The agent might notice that the team said "failover should work" (hedging language = surface signal) and follow up with "have you actually tested failover? What happened?"

### 5. Act

The agent calls tools to capture what it observed. Up to 5 iterations per turn — the agent can call multiple tools and then respond, or alternate between tools and text.

**The eight tools and what they capture:**

| Tool | What it captures | Learning signal |
|------|-----------------|-----------------|
| `update_question_response` | Team's answer + whether it came from memory or code | Source = "code" means the team didn't know from experience |
| `update_depth_assessment` | SURFACE / MODERATE / DEEP + rationale | How well the team actually understands this section |
| `set_flags` | RISK, GAP, STRENGTH, FOLLOW_UP with notes | What needs attention AND what's working well |
| `record_discovery` | Specific learning moment with section context | Surprises, predictions gone wrong, WAI-WAD gaps |
| `read_section` | Loads full section detail | Agent checking what's already been covered |
| `update_section_content` | Writes observations into the document | Persists insights into the durable artifact |
| `query_teaching_moments` | Searches for relevant industry incidents | Grounds discussion in real-world patterns |
| `write_session_summary` | Narrative summary + key discoveries | Catch-all at session end; carries forward to future sessions |

**The answer source distinction matters:**

When the agent records a question response, it marks whether the answer came from the team's memory (`source: "team"`) or from reading source code (`source: "code"`). Code-sourced answers appear as "blind spots" in the Learning tab — areas where the team's operational knowledge depends on reading code rather than lived experience.

### 6. Respond

After calling tools, the agent generates its response — typically:

- Acknowledging what the team said
- A brief observation connecting their answer to a broader pattern
- One focused follow-up question (not three — "the pause after a single question is where thinking happens")

The agent is instructed to ask one question at a time. Batching questions lets teams pick the easiest one and skip the rest. Single questions force engagement.

### 7. Stream

Everything flows back to the frontend as Server-Sent Events in real-time:

- `tool_call` events show what the agent is doing: "Recording discovery...", "Assessing depth...", "Writing observations..."
- `content_delta` events stream the text response word by word
- `section_updated` events trigger the sidebar to refresh, showing new depth levels or flags
- `message_end` carries token usage for budget tracking

The animated thinking indicator maps tool names to human-readable labels so the team knows the agent is working, not frozen.

### 8. Persist

After the turn completes:

- The agent's full response is stored in `sessionMessages` with metadata about which tools were called
- Discoveries are in the `discoveries` table
- Depth assessments and flags are on the section record
- Question responses are in the section's `promptResponses` JSON

All of this feeds into:
- **The Learning tab** — radar charts, stat cards, section cards showing strengths, surprises, gaps
- **The Flags view** — aggregated risks, gaps, and strengths across all sections
- **Future sessions** — prior session summaries provide context, returning-session check-in tests recall
- **Markdown export** — the document with all observations, depth assessments, and flags

## The Retroactive Path: `/learning`

Not all learning signals are captured in real-time. The `/learning` slash command triggers a second pass:

1. User types `/learning` in the chat
2. The backend clears all previous `/learning` discoveries (tagged `source: "learning_command"`) for this practice
3. The agent receives a prompt: "Review all sections for learning signals. For each surprise, mental model change, WAI-WAD gap, or blind spot you find, IMMEDIATELY call `record_discovery`."
4. The agent already has all section summaries, depth assessments, flags, and session summaries in its context
5. It calls `record_discovery` for each signal found — typically 5-15 per review
6. The Learning tab updates on refresh

This catches signals that accumulated across sessions but weren't flagged individually — patterns that only become visible when you look at everything together.

## What Makes This Different

Most AI-assisted documentation tools draft the document *for* the team. The AI does the thinking; the team reviews the output. That optimizes for document quality but bypasses the learning.

This system does the opposite. The team does the thinking. The AI asks questions, probes assumptions, and captures what happens when the team engages with their own system's operational reality. The learning signals aren't extracted from documents — they emerge from the conversation itself.

The depth assessment framework is key. Surface-level answers ("we have retry logic") look complete in a document. But the agent's job is to push past that: "What's the retry strategy? What happens after exhausting retries? Have you tested what happens when the downstream is slow rather than down?" The team's response to that probing — whether they can answer from experience or need to check the code — is the signal.

The document is the artifact. The conversation is where learning happens.
