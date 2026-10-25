import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATE_SECTIONS, INCIDENT_TEMPLATE_SECTIONS } from "@orr/shared";
import { createOrrSchema, updateOrrSchema, updateSectionSchema, validateBody } from "./validation.js";

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

describe("request array bounds", () => {
  const sections = (n: number, prompts: string[] = ["q"]) =>
    Array.from({ length: n }, (_, i) => ({ title: `s${i}`, prompts }));

  it.each([
    ["default", DEFAULT_TEMPLATE_SECTIONS],
    ["incident", INCIDENT_TEMPLATE_SECTIONS],
  ])("accepts every section of the bundled %s template", (_, template) => {
    const selectedSections = template.map((s) => ({ title: s.title, prompts: s.prompts }));
    const r = validateBody(createOrrSchema, { serviceName: "x", orrType: "feature", selectedSections });
    expect(r.success).toBe(true);
  });

  it("rejects more than 50 selected sections", () => {
    expect(validateBody(createOrrSchema, { serviceName: "x", selectedSections: sections(50) }).success).toBe(true);
    expect(validateBody(createOrrSchema, { serviceName: "x", selectedSections: sections(51) }).success).toBe(false);
  });

  it("rejects more than 200 prompts in a selected section", () => {
    const prompts = Array(201).fill("q");
    expect(validateBody(createOrrSchema, { serviceName: "x", selectedSections: sections(1, prompts) }).success).toBe(false);
  });

  it("rejects more than 200 prompts on section update", () => {
    expect(validateBody(updateSectionSchema, { prompts: Array(200).fill("q") }).success).toBe(true);
    expect(validateBody(updateSectionSchema, { prompts: Array(201).fill("q") }).success).toBe(false);
  });

  it("bounds promptResponses at 200 keys and keeps the JSON-string form", () => {
    const responses = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, "a"]));
    expect(validateBody(updateSectionSchema, { promptResponses: responses(200) }).success).toBe(true);
    expect(validateBody(updateSectionSchema, { promptResponses: responses(201) }).success).toBe(false);
    expect(validateBody(updateSectionSchema, { promptResponses: JSON.stringify(responses(3)) }).success).toBe(true);
    expect(validateBody(updateSectionSchema, { promptResponses: { 0: { answer: "a", source: "code" } } }).success).toBe(true);
  });

  // GHSA-mrhx-c7xc-m3w5: an oversized collection of invalid elements must fail on
  // its size, not produce one issue per element.
  it("rejects a huge invalid prompts array with a single issue", () => {
    const r = updateSectionSchema.safeParse({ prompts: Array(200_000).fill(42) });
    expect(r.success).toBe(false);
    expect(r.error?.issues).toHaveLength(1);
  });

  it("rejects a huge invalid promptResponses record without per-key issues", () => {
    const promptResponses = Object.fromEntries(Array.from({ length: 200_000 }, (_, i) => [`k${i}`, 42]));
    const r = updateSectionSchema.safeParse({ promptResponses });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues).length).toBeLessThan(2_000);
  });
});
