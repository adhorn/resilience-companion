/**
 * Long-session realism scenario.
 *
 * Intentionally exercises the production token-budget pathway: a chatty
 * deeply-knowledgeable engineer with a complex polyglot stack drives the
 * conversation past the 75% (`SESSION_TOKEN_WARNING`) and 90%
 * (`SESSION_TOKEN_URGENT`) thresholds, which triggers the agent to call
 * `write_session_summary` before context is rotated.
 *
 * Unlike the other scenarios in this suite (which run on Sonnet to keep
 * cost down), this one deliberately uses the env-default model — usually
 * Opus — because the goal is to validate that the most expensive
 * realistic production path actually works end-to-end. Budget this
 * scenario as a single ~1-2M-token regression check, not a per-PR test.
 */

import type { EvalScenario } from "../types.js";

export const longSessionScenarios: EvalScenario[] = [
  {
    id: "long-session-realism",
    name: "Long session: agent writes summary before token budget exhaustion",
    category: "tool_usage",
    type: "regression",
    practiceType: "orr",
    // No model field — intentionally inherits LLM_MODEL env (top-tier model).
    maxTurns: 12,
    userPersona: {
      style: "verbose",
      knowledge: `
- Architecture: Node.js + Python polyglot microservices on Kubernetes (EKS), 14 services across 3 teams
- Inter-service comms: REST for synchronous reads, Kafka for ordered async events
- Service mesh: Istio for east-west traffic, mTLS between all services
- Databases: PostgreSQL (Aurora) for transactional, Redis (ElastiCache) for caching, DynamoDB for session storage
- Observability: Datadog APM, Grafana for custom dashboards, Splunk for logs, Sentry for errors
- Deploy pipeline: GitHub Actions → ECR → ArgoCD → blue/green via Istio traffic shifting
- Rollback: automatic if 5xx rate > 2% over 5min, manual otherwise; rollback takes ~8 minutes end-to-end
- Feature flags: LaunchDarkly, 200+ active flags, no formal cleanup process
- Testing: pact contract tests between services, integration tests in ephemeral envs, quarterly load tests
- Chaos: monthly GameDay exercising AZ failure + dependency degradation; last one surfaced a Kafka consumer-lag issue
- On-call: 24/7 follow-the-sun across three regions, escalation policy in PagerDuty
- Known gap 1: no formal SLO/SLI definitions — team operates on aspirational p99 targets without budget tracking
- Known gap 2: cross-region DynamoDB replication exists but has never been load-tested under real traffic
- Failure mode worth describing in detail if asked: a slow downstream (not down, just slow) can saturate
  the Istio sidecar's connection pool before any retry budget kicks in, because retries inherit the parent
  request's deadline. We hit this in production last quarter — took 40 min to diagnose.
      `.trim(),
      systemPrompt: `
You are a senior staff engineer who has been at the company for 5 years and knows the architecture
in detail. When asked, walk through full technical specifics: service names, configuration values,
deploy timings, retry policies, blast radius reasoning. Don't be terse — give complete, multi-sentence
answers with named examples. Be honest about the two known gaps when they're relevant. If asked to
predict failure behavior, walk through the scenario in detail including timing and cascading effects.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "tool_called",
        tool: "write_session_summary",
        description: "Agent writes session summary during long session (triggered by token-budget threshold)",
      },
      {
        type: "min_tool_calls",
        minCalls: 10,
        description: "Long session produces substantial tool activity (≥10 calls)",
      },
    ],
  },
];
