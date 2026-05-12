/**
 * Tool usage scenarios — verify the agent calls the right tools at the right rate.
 *
 * These catch the degradation pattern where the agent has a pleasant conversation
 * but stops making tool calls to actually update the document.
 */

import type { EvalScenario } from "../types.js";

export const toolUsageScenarios: EvalScenario[] = [
  {
    id: "tool-min-call-rate",
    name: "Minimum tool call rate across a short conversation",
    category: "tool_usage",
    type: "regression",
    practiceType: "orr",
    model: "sonnet",
    maxTurns: 3,
    userPersona: {
      style: "cooperative",
      knowledge: `
- Architecture: Node.js microservice on Kubernetes
- PostgreSQL for persistence, Redis for caching
- Deployed via Helm charts; staging mirrors production
- Monitoring: Prometheus + Grafana, alerts via PagerDuty
- Tests: Jest unit tests, Playwright E2E, run in CI on every PR
      `.trim(),
      systemPrompt: `
You are a senior engineer ready to discuss your service's readiness.
Answer questions directly with technical specifics.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "min_tool_calls",
        minCalls: 1,
        description: "At least 1 read tool call in a 4-turn conversation (read_section, query_*)",
      },
    ],
  },

  {
    id: "tool-depth-assessment",
    name: "Depth assessment is called after substantive answers (any value)",
    category: "tool_usage",
    type: "regression",
    practiceType: "orr",
    model: "sonnet",
    maxTurns: 4,
    userPersona: {
      style: "cooperative",
      knowledge: `
- Architecture: Django monolith, deployed on Heroku
- No load balancer; relies on Heroku dynos
- Database: Heroku PostgreSQL, no read replicas
- Monitoring: Sentry for errors only; no metrics dashboard
- No runbooks, no on-call rotation (best-effort response)
- Testing: minimal unit tests, no CI; deployments done manually
      `.trim(),
      systemPrompt: `
You are a startup engineer with a simple but honest answer for everything.
When asked about monitoring, reliability, or testing, share what actually exists —
which isn't much. Be honest about gaps.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "tool_called",
        tool: "update_depth_assessment",
        description: "Agent called update_depth_assessment with a rationale (any depth value)",
      },
    ],
  },

  {
    id: "tool-depth-assessment-surface",
    name: "Depth assessed as SURFACE when team is confidently vague (fluency illusion)",
    category: "tool_usage",
    type: "regression",
    practiceType: "orr",
    model: "sonnet",
    maxTurns: 5,
    userPersona: {
      style: "cooperative",
      knowledge: `
- Architecture: "a modern microservices stack" — you don't know the exact service boundaries or call graph
- Monitoring: "we have dashboards and alerts" — you can't actually name the dashboards or recall any alert thresholds
- Failure behavior: if asked what happens when a downstream service fails, say "we have retries and timeouts" — but you can't describe the actual configuration, retry policy, or backoff
- Runbooks: "we have docs in Confluence" — you can't recall the URL or what's actually in them
- On-call: "yes we have on-call" — you don't know the rotation, escalation policy, or how alerts are routed
      `.trim(),
      systemPrompt: `
You are a senior engineer who believes your team has a solid setup. Answer questions
with confidence — "we have X" — but when pressed for specifics, give vague non-answers
("I think it's configured properly", "I'd have to check but yes we have that").
Never admit you don't know the details. The pattern: confident on existence, vague on
substance. Don't volunteer gaps. Keep answers 1-3 sentences.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "depth_set",
        sectionIndex: 0,
        depth: "SURFACE",
        description: "Depth is correctly assessed as SURFACE when team is confidently vague",
      },
    ],
  },

  {
    id: "tool-no-unsolicited-code-search",
    name: "Agent does NOT search code unless user asks",
    category: "tool_usage",
    type: "regression",
    practiceType: "orr",
    model: "sonnet",
    maxTurns: 3,
    userPersona: {
      style: "cooperative",
      knowledge: `
- Service is an inventory management API written in Go
- Deployed on GCP Cloud Run
- PostgreSQL with GORM ORM
- Testing: table-driven unit tests, ~70% coverage
      `.trim(),
      systemPrompt: `
You are a Go engineer answering readiness questions.
Give clear answers about your service. Don't ask the reviewer to look at your code.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "tool_not_called",
        tool: "search_code",
        description: "Agent does NOT call search_code unless explicitly asked to",
      },
      {
        type: "tool_not_called",
        tool: "read_file",
        description: "Agent does NOT call read_file unprompted",
      },
    ],
  },
];
