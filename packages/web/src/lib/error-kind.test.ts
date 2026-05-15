import { describe, it, expect } from "vitest";
import { classifyApiError } from "./error-kind.js";

describe("classifyApiError", () => {
  it("classifies a 429 with token_limit code as token_limit", () => {
    const err = Object.assign(new Error("Daily token limit reached (10000k / 10000k). Resets at midnight."), {
      status: 429,
      errorCode: "token_limit",
    });
    expect(classifyApiError(err)).toEqual({
      kind: "token_limit",
      message: "Daily token limit reached (10000k / 10000k). Resets at midnight.",
    });
  });

  it("classifies a 429 without errorCode as transient (not enough info)", () => {
    const err = Object.assign(new Error("Rate limited"), { status: 429 });
    expect(classifyApiError(err)).toEqual({
      kind: "transient",
      message: "Rate limited",
    });
  });

  it("classifies a 500 as transient", () => {
    const err = Object.assign(new Error("Server error"), { status: 500 });
    expect(classifyApiError(err)).toEqual({
      kind: "transient",
      message: "Server error",
    });
  });

  it("classifies a plain Error with no status as transient", () => {
    expect(classifyApiError(new Error("Network failed"))).toEqual({
      kind: "transient",
      message: "Network failed",
    });
  });

  it("uses a fallback message when err has no message", () => {
    expect(classifyApiError({})).toEqual({
      kind: "transient",
      message: "Something went wrong.",
    });
  });

  it("uses a fallback message for null/undefined input", () => {
    expect(classifyApiError(null)).toEqual({
      kind: "transient",
      message: "Something went wrong.",
    });
    expect(classifyApiError(undefined)).toEqual({
      kind: "transient",
      message: "Something went wrong.",
    });
  });

  it("requires status === 429 AND errorCode === 'token_limit' for token_limit", () => {
    // status alone isn't enough
    const justStatus = Object.assign(new Error("blocked"), { status: 429, errorCode: "rate_limit" });
    expect(classifyApiError(justStatus).kind).toBe("transient");
    // errorCode alone (wrong status) isn't enough
    const justCode = Object.assign(new Error("blocked"), { status: 403, errorCode: "token_limit" });
    expect(classifyApiError(justCode).kind).toBe("transient");
  });
});
