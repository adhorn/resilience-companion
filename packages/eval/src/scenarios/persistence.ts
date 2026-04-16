/**
 * Persistence scenarios — the "discussed but not persisted" test suite.
 *
 * These are the most critical evals: they verify that when a team member
 * answers a question during the ORR, the agent actually writes the answer
 * back to the document via update_question_response or related tools.
 *
 * The default seedTestOrr() sections are:
 *   index 0: "Architecture" — prompts: ["What is the architecture?", "What are the dependencies?"]
 *   index 1: "Monitoring"   — prompts: ["How do you monitor?"]
 *   index 2: "Testing"      — prompts: ["How do you test?", "What is your test coverage?", "Do you do chaos testing?"]
 */

import type { EvalScenario } from "../types.js";

export const persistenceScenarios: EvalScenario[] = [
  {
    id: "persist-basic-qa",
    name: "Basic Q&A: 2 architecture answers are persisted",
    category: "persistence",
    type: "capability",
    practiceType: "orr",
    maxTurns: 5,
    userPersona: {
      style: "cooperative",
      knowledge: `
- The service is a Python FastAPI monolith deployed on AWS ECS
- It connects to PostgreSQL (RDS) and Redis (ElastiCache) for caching
- The service handles user authentication and billing
- Dependencies: Stripe for payments, SendGrid for email, Auth0 for OAuth
- No service mesh; services communicate via REST over internal load balancers
      `.trim(),
      systemPrompt: `
You are a senior backend engineer being walked through an ORR for your team's billing service.
You know your system well and give direct, factual answers when asked.
When the reviewer asks about architecture or dependencies, share the relevant details from your knowledge.
Don't over-explain — answer what's asked.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "tool_called",
        tool: "update_question_response",
        description: "Agent persists at least one architecture answer",
      },
      {
        type: "min_tool_calls",
        minCalls: 2,
        description: "At least 2 tool calls in a 5-turn conversation",
      },
    ],
  },

  {
    id: "persist-multi-question",
    name: "Multi-question section: all 3 monitoring prompts persisted",
    category: "persistence",
    type: "capability",
    practiceType: "orr",
    maxTurns: 8,
    userPersona: {
      style: "cooperative",
      knowledge: `
- Monitoring uses Datadog for metrics, logs, and APM
- PagerDuty for alerting; on-call rotation runs weekly
- Key dashboards: request latency (p50/p95/p99), error rate, DB connection pool
- Alerts fire at: error rate > 1%, p99 latency > 800ms, DB pool > 80% utilization
- Runbooks exist for the top 3 alerts but not for DB pool exhaustion
- No synthetic monitoring or uptime checks yet
      `.trim(),
      systemPrompt: `
You are a platform engineer responsible for monitoring your team's API gateway.
You're knowledgeable about your monitoring setup and willing to share specifics when asked.
If asked about gaps or missing runbooks, be honest about what doesn't exist yet.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "question_persisted",
        sectionIndex: 1,
        questionIndex: 0,
        description: "Monitoring question (index 0) is persisted to section 1",
      },
      {
        type: "tool_called",
        tool: "update_question_response",
        description: "update_question_response called at least once for monitoring section",
      },
    ],
  },

  {
    id: "persist-dependency-mention",
    name: "Dependency mention triggers record_dependency",
    category: "persistence",
    type: "capability",
    practiceType: "orr",
    maxTurns: 5,
    userPersona: {
      style: "cooperative",
      knowledge: `
- The service depends on an internal User Service (gRPC, synchronous)
- If User Service is down, authentication fails completely — no fallback
- Also depends on S3 for file storage (async, failures are queued and retried)
- Redis is used for session caching; if it goes down, users get logged out
      `.trim(),
      systemPrompt: `
You are a backend engineer. When asked about dependencies or what your service relies on,
explain the dependencies clearly including any coupling or failure modes.
Be direct and technical.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "tool_called",
        tool: "record_dependency",
        description: "Agent records at least one external dependency mentioned",
      },
    ],
  },

  {
    id: "persist-long-answer",
    name: "Long detailed answer is persisted (not dropped)",
    category: "persistence",
    type: "regression",
    practiceType: "orr",
    maxTurns: 4,
    userPersona: {
      style: "verbose",
      knowledge: `
- The service uses a custom deployment pipeline: code merged to main triggers GitHub Actions,
  which builds a Docker image, pushes to ECR, runs integration tests, then deploys to ECS via
  blue/green deployment. The old task set stays alive for 10 minutes during traffic cutover,
  allowing rollback if error rate spikes. Deployment takes 12-15 minutes end-to-end.
- Rollback: automatic if CloudWatch alarm fires within the 10-minute window, manual otherwise.
- Feature flags managed via LaunchDarkly; can disable features without a deploy.
      `.trim(),
      systemPrompt: `
You are an engineer who gives thorough, detailed answers. When asked how you test or deploy,
walk through the full process with specifics. Don't cut your answer short.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "tool_called",
        tool: "update_question_response",
        description: "Agent persists the detailed answer (not dropped due to length)",
      },
    ],
  },

  {
    id: "persist-terse-answers",
    name: "Terse answers: agent probes and persists what it learns",
    category: "persistence",
    type: "capability",
    practiceType: "orr",
    maxTurns: 8,
    userPersona: {
      style: "terse",
      knowledge: `
- Tests exist: unit tests at ~60% coverage, no integration tests
- CI/CD: GitHub Actions, runs on every PR
- No chaos testing
- Test suite takes about 3 minutes
      `.trim(),
      systemPrompt: `
You are a busy engineer who gives very short answers.
Answer in 1-2 sentences only. Wait to be asked follow-ups.
If pressed, give a bit more detail but stay brief.
      `.trim(),
    },
    expectedOutcomes: [
      {
        type: "tool_called",
        tool: "update_question_response",
        description: "Agent persists answers even when they are very brief",
      },
      {
        type: "min_tool_calls",
        minCalls: 1,
        description: "At least 1 persistence tool call in the conversation",
      },
    ],
  },
];
