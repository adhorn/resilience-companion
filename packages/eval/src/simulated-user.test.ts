import { describe, it, expect } from "vitest";
import { shouldEndConversation, SimulatedUser } from "./simulated-user.js";
import type { UserPersona } from "./types.js";

describe("shouldEndConversation", () => {
  it("ends on empty string", () => {
    expect(shouldEndConversation("")).toBe(true);
  });

  it("ends on whitespace-only response", () => {
    expect(shouldEndConversation("   \n\t  ")).toBe(true);
  });

  it("ends on exact [DONE] sentinel", () => {
    expect(shouldEndConversation("[DONE]")).toBe(true);
  });

  it("ends on [DONE] with trailing text", () => {
    expect(shouldEndConversation("[DONE] thanks for the review")).toBe(true);
  });

  it("ends on short 'nothing else to add' phrases", () => {
    expect(shouldEndConversation("Nothing else to add.")).toBe(true);
    expect(shouldEndConversation("I've got nothing else to add, thanks!")).toBe(true);
  });

  it("does NOT end on a long message that happens to contain 'nothing else to add'", () => {
    const longMsg =
      "I think nothing else to add comes to mind, but actually we should also talk about " +
      "the dependency on the auth service which is on the critical path";
    expect(shouldEndConversation(longMsg)).toBe(false);
  });

  it("does NOT end on a substantive response", () => {
    expect(shouldEndConversation("We monitor with Datadog and PagerDuty.")).toBe(false);
  });
});

describe("SimulatedUser.nextMessage", () => {
  const stubPersona: UserPersona = {
    systemPrompt: "test",
    knowledge: "test",
    style: "cooperative",
  };

  it("returns null when the agent message is empty (without calling the API)", async () => {
    const user = new SimulatedUser(stubPersona, "fake-key-not-used");
    // If the early-return guard is missing, this would fail with an auth error
    // when the SDK tries to call Anthropic with the fake key.
    const result = await user.nextMessage("");
    expect(result).toBeNull();
  });

  it("returns null when the agent message is whitespace-only", async () => {
    const user = new SimulatedUser(stubPersona, "fake-key-not-used");
    const result = await user.nextMessage("   \n\t  ");
    expect(result).toBeNull();
  });
});
