import { describe, it, expect } from "vitest";
import { generateFeatureTemplate, countFeaturePrompts, IMPACT_QUESTIONS, UNIVERSAL_QUESTIONS } from "./feature-template.js";
import type { ChangeType } from "../constants.js";

describe("generateFeatureTemplate", () => {
  it("generates impact + readiness + universal for a single change type", () => {
    const sections = generateFeatureTemplate(["new_dependency"]);
    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe("Impact on Existing Service");
    expect(sections[1].title).toBe("Dependency Readiness");
    expect(sections[2].title).toBe("General Readiness");
    expect(sections[2].prompts).toEqual(UNIVERSAL_QUESTIONS);
  });

  it("generates one readiness section per change type", () => {
    const sections = generateFeatureTemplate(["new_dependency", "new_endpoint"]);
    expect(sections).toHaveLength(4);
    expect(sections.map((s) => s.title)).toEqual([
      "Impact on Existing Service",
      "Dependency Readiness",
      "Endpoint Readiness",
      "General Readiness",
    ]);
  });

  it("deduplicates prompts when change types overlap", () => {
    // Two different change types with distinct readiness sections
    const sections = generateFeatureTemplate(["scaling_change", "infrastructure_change"]);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("Scaling Readiness");
    expect(titles).toContain("Infrastructure Readiness");
    // Each title appears exactly once
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("includes all impact questions when no parent sections provided", () => {
    const sections = generateFeatureTemplate(["new_dependency"]);
    const impactSection = sections.find((s) => s.title === "Impact on Existing Service");
    expect(impactSection).toBeDefined();
    expect(impactSection!.prompts.length).toBe(Object.keys(IMPACT_QUESTIONS).length);
  });

  it("filters impact questions based on parent sections with content", () => {
    const parentSections = [
      { title: "Architecture", hasContent: true },
      { title: "Monitoring", hasContent: true },
      { title: "Deployment", hasContent: false }, // no content — should be excluded
    ];
    const sections = generateFeatureTemplate(["new_dependency"], parentSections);
    const impactSection = sections.find((s) => s.title === "Impact on Existing Service");
    expect(impactSection).toBeDefined();
    // Only Architecture and Monitoring have content, so 2 impact questions
    expect(impactSection!.prompts.length).toBe(2);
  });

  it("assigns sequential positions starting at 1", () => {
    const sections = generateFeatureTemplate(["new_dependency", "data_model_change"]);
    for (let i = 0; i < sections.length; i++) {
      expect(sections[i].position).toBe(i + 1);
    }
  });

  it("handles all seven change types without error", () => {
    const allTypes: ChangeType[] = [
      "new_dependency", "new_endpoint", "data_model_change",
      "scaling_change", "infrastructure_change",
      "security_boundary_change", "failure_domain_change",
    ];
    const sections = generateFeatureTemplate(allTypes);
    // 1 impact + 7 readiness + 1 universal = 9
    expect(sections).toHaveLength(9);
  });
});

describe("countFeaturePrompts", () => {
  it("returns correct counts for single change type", () => {
    const counts = countFeaturePrompts(["new_dependency"]);
    expect(counts.sections).toBe(3);
    // Impact (6) + Dependency Readiness (10) + Universal (5) = 21
    expect(counts.prompts).toBe(21);
  });

  it("matches generateFeatureTemplate output", () => {
    const types: ChangeType[] = ["new_endpoint", "scaling_change"];
    const template = generateFeatureTemplate(types);
    const counts = countFeaturePrompts(types);
    expect(counts.sections).toBe(template.length);
    expect(counts.prompts).toBe(template.reduce((sum, s) => sum + s.prompts.length, 0));
  });
});
