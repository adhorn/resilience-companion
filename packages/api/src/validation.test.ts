import { describe, it, expect } from "vitest";
import { createOrrSchema, updateOrrSchema, validateBody } from "./validation.js";

describe("repositoryServicePath validation", () => {
  it("accepts a relative path on create", () => {
    const r = validateBody(createOrrSchema, { serviceName: "x", repositoryServicePath: "services/payments" });
    expect(r.success).toBe(true);
  });

  it("accepts empty string on create", () => {
    const r = validateBody(createOrrSchema, { serviceName: "x", repositoryServicePath: "" });
    expect(r.success).toBe(true);
  });

  it("accepts omitted field on create", () => {
    const r = validateBody(createOrrSchema, { serviceName: "x" });
    expect(r.success).toBe(true);
  });

  it("rejects leading slash on create", () => {
    const r = validateBody(createOrrSchema, { serviceName: "x", repositoryServicePath: "/etc" });
    expect(r.success).toBe(false);
  });

  it("rejects '..' segments on create", () => {
    const r = validateBody(createOrrSchema, { serviceName: "x", repositoryServicePath: "services/../etc" });
    expect(r.success).toBe(false);
  });

  it("rejects '..' alone on create", () => {
    const r = validateBody(createOrrSchema, { serviceName: "x", repositoryServicePath: ".." });
    expect(r.success).toBe(false);
  });

  it("accepts null on update", () => {
    const r = validateBody(updateOrrSchema, { repositoryServicePath: null });
    expect(r.success).toBe(true);
  });

  it("rejects backslash '..' segments on create (Windows-style)", () => {
    const r = validateBody(createOrrSchema, { serviceName: "x", repositoryServicePath: "services\\..\\etc" });
    expect(r.success).toBe(false);
  });
});
