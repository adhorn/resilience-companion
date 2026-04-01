import { describe, it, expect } from "vitest";
import {
  assessEngagement,
  hedgingRatio,
  hasTersePattern,
  hasWallHitPattern,
  hasFluentNoSurprisePattern,
} from "./engagement.js";
import type { LLMMessage } from "../llm/index.js";

// Helper: build a history with alternating user/assistant messages
function buildHistory(userMessages: string[]): LLMMessage[] {
  const messages: LLMMessage[] = [];
  for (const msg of userMessages) {
    messages.push({ role: "user", content: msg });
    messages.push({ role: "assistant", content: "OK, tell me more." });
  }
  return messages;
}

describe("hedgingRatio", () => {
  it("returns 0 for empty input", () => {
    expect(hedgingRatio([])).toBe(0);
  });

  it("detects hedging language", () => {
    const msgs = [
      "I think we have circuit breakers",
      "Probably it fails gracefully",
      "Not sure about the timeout",
      "We should be covered there",
      "Theoretically the retries handle it",
    ];
    expect(hedgingRatio(msgs)).toBe(1.0);
  });

  it("returns low ratio for confident messages", () => {
    const msgs = [
      "We have circuit breakers on all external dependencies",
      "The timeout is 30 seconds, configured in the retry module",
      "Our load balancer handles failover in under 2 seconds",
      "We test this monthly with chaos experiments",
      "The SLA is 99.95% and we've met it every quarter",
    ];
    expect(hedgingRatio(msgs)).toBe(0);
  });

  it("only looks at last 5 messages", () => {
    const msgs = [
      "I think so", "probably", "maybe", // old — should be ignored
      "We have solid monitoring",
      "The pipeline runs in 4 minutes",
      "We deploy 10 times a day",
      "Our rollback takes under 30 seconds",
      "We test with real traffic mirroring",
    ];
    expect(hedgingRatio(msgs)).toBe(0);
  });
});

describe("hasTersePattern", () => {
  it("detects terse responses", () => {
    expect(hasTersePattern(["no", "I don't know", "not sure"])).toBe(true);
  });

  it("returns false for long responses", () => {
    expect(hasTersePattern([
      "We have a comprehensive monitoring setup with Datadog",
      "Our alerts fire within 30 seconds of threshold breach",
      "The on-call rotation covers all timezones",
    ])).toBe(false);
  });

  it("requires at least 3 messages", () => {
    expect(hasTersePattern(["no", "nope"])).toBe(false);
  });
});

describe("hasWallHitPattern", () => {
  it("detects repeated wall-hits", () => {
    expect(hasWallHitPattern([
      "I don't know",
      "No idea how that works",
      "I'd have to check",
    ])).toBe(true);
  });

  it("returns false with one wall-hit", () => {
    expect(hasWallHitPattern([
      "I don't know",
      "We use Kubernetes for orchestration",
      "The pods auto-scale based on CPU",
    ])).toBe(false);
  });
});

describe("hasFluentNoSurprisePattern", () => {
  it("detects long confident answers", () => {
    const msgs = [
      "We have a comprehensive monitoring setup with Datadog and PagerDuty. Our alerts are configured with multiple severity levels and each one routes to the appropriate on-call team based on the service affected and the time of day.",
      "Our deployment pipeline runs through three stages: build, test, and canary deployment. Each stage has automated gates that prevent progression if quality metrics drop below our thresholds. We deploy about ten times per day.",
      "The disaster recovery plan was tested last month during our quarterly GameDay. We simulated a full region failure and successfully failed over to our secondary region within our 15-minute RTO target.",
      "Our circuit breakers are configured with a 50% error threshold and a 30-second window. When they trip, traffic automatically routes to our cached responses while we investigate. We've tuned these parameters based on our last three incidents.",
      "The database replication lag is typically under 100ms. We monitor this continuously and have alerts at 500ms and 1s thresholds. In the last six months, we've had two instances where lag exceeded 1s, both during planned maintenance windows.",
    ];
    expect(hasFluentNoSurprisePattern(msgs)).toBe(true);
  });

  it("returns false when hedging present", () => {
    const msgs = [
      "I think we have monitoring but I'm not totally sure about the alert thresholds. We probably use Datadog for most of it but there might be some things in CloudWatch too.",
      "The deployment process should be automated but I'm not confident about all the stages. I think there's a canary step but maybe not for all services.",
      "Our DR plan was probably tested at some point but I don't remember when exactly.",
    ];
    expect(hasFluentNoSurprisePattern(msgs)).toBe(false);
  });

  it("needs at least 3 messages", () => {
    expect(hasFluentNoSurprisePattern(["Long confident answer here".repeat(20)])).toBe(false);
  });
});

describe("assessEngagement", () => {
  it("returns PRODUCTIVE with insufficient data", () => {
    const history = buildHistory(["hello", "yes"]);
    const result = assessEngagement(history, null);
    expect(result.zone).toBe("PRODUCTIVE");
    expect(result.confidence).toBe(0);
  });

  it("detects FRUSTRATED zone from wall-hit + hedging", () => {
    const history = buildHistory([
      "I think we have some monitoring",
      "I'm not sure how the alerts work",
      "I don't know",
      "No idea",
      "I'd have to look that up",
    ]);
    const result = assessEngagement(history, null);
    expect(result.zone).toBe("FRUSTRATED");
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it("detects FRUSTRATED zone from high code-source ratio", () => {
    const history = buildHistory([
      "I don't know how the retries work",
      "No idea about the circuit breakers",
      "Can't remember the timeout values",
    ]);
    const section = { depth: "SURFACE", codeSourced: 4, questionsAnswered: 5 };
    const result = assessEngagement(history, section);
    expect(result.zone).toBe("FRUSTRATED");
  });

  it("detects TOO_EASY zone from fluent + stuck at SURFACE", () => {
    const long = "We have a comprehensive setup for this area. Our team manages it well with automated processes and regular reviews. The configuration is documented and we update it quarterly based on our operational review cycle. Everything is tracked in our internal wiki and Jira.";
    const history = buildHistory([
      long, long, long, long, long, long, long,
    ]);
    const section = { depth: "SURFACE", codeSourced: 0, questionsAnswered: 3 };
    const result = assessEngagement(history, section);
    expect(result.zone).toBe("TOO_EASY");
  });

  it("returns PRODUCTIVE for mixed signals", () => {
    const history = buildHistory([
      "We use circuit breakers on all external calls",
      "I'm not sure about the exact timeout — maybe 30 seconds?",
      "Oh wait, I know this — it's configured in the retry module with exponential backoff",
      "The load balancer handles failover, we tested it last month",
      "Hmm, good question about the blast radius — I'd need to think about that",
    ]);
    const result = assessEngagement(history, null);
    expect(result.zone).toBe("PRODUCTIVE");
  });
});
