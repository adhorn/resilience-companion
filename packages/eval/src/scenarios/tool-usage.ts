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
    name: "Minimum tool call rate across a 4-turn conversation",
    category: "tool_usage",
    type: "regression",
    practiceType: "orr",
    maxTurns: 4,
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
    name: "Depth assessment called after substantive answers",
    category: "tool_usage",
    type: "capability",
    practiceType: "orr",
    maxTurns: 7,
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
        type: "depth_set",
        sectionIndex: 0,
        depth: "SURFACE",
        description: "Section depth is assessed after substantive conversation (SURFACE expected for minimal setup)",
      },
    ],
  },

  {
    id: "tool-no-unsolicited-code-search",
    name: "Agent does NOT search code unless user asks",
    category: "tool_usage",
    type: "regression",
    practiceType: "orr",
    maxTurns: 4,
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
