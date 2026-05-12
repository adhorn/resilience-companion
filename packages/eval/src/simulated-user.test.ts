import { describe, it, expect } from "vitest";
import { shouldEndConversation } from "./simulated-user.js";

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
