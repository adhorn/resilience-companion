/**
 * Input validation schemas for API routes.
 * Uses zod for runtime validation at system boundaries.
 */
import { z } from "zod";

// --- Reusable primitives ---

const shortString = (max = 255) => z.string().min(1).max(max);
const optionalShortString = (max = 255) => z.string().max(max).optional();
const contentString = (max = 100_000) => z.string().max(max);

// --- ORR schemas ---

export const createOrrSchema = z.object({
  serviceName: shortString(),
  templateId: z.string().max(100).optional(),
  repositoryUrl: z.string().url().max(2000).optional(),
  repositoryToken: z.string().max(2000).optional(),
  // Feature ORR fields
  orrType: z.enum(["service", "feature"]).optional().default("service"),
  parentOrrId: z.string().max(100).optional(),
  changeTypes: z.array(z.string().max(100)).max(20).optional().default([]),
  changeDescription: z.string().max(5000).optional(),
  selectedSections: z.array(z.object({
    title: z.string().max(255),
    prompts: z.array(z.string().max(2000)),
  })).optional(),
});

export const terminateOrrSchema = z.object({
  reason: z.string().min(1, "Termination reason is required").max(2000),
});

export const updateOrrSchema = z.object({
  status: z.enum(["DRAFT", "IN_PROGRESS", "COMPLETE"]).optional(),
  serviceName: shortString().optional(),
  steeringTier: z.enum(["standard", "thorough", "rigorous"]).optional(),
  repositoryUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
  repositoryToken: z.string().max(2000).optional(),
});

// --- Incident schemas ---

export const createIncidentSchema = z.object({
  title: shortString(500),
  serviceName: z.string().max(255).nullish(),
  incidentDate: z.string().max(100).nullish(),
  severity: z.string().max(50).nullish(),
  incidentType: z.string().max(100).nullish(),
});

export const updateIncidentSchema = z.object({
  title: shortString(500).optional(),
  serviceName: z.string().max(255).nullish(),
  incidentDate: z.string().max(100).nullish(),
  severity: z.string().max(50).nullish(),
  incidentType: z.string().max(100).nullish(),
  status: z.enum(["DRAFT", "IN_PROGRESS", "PUBLISHED"]).optional(),
  steeringTier: z.enum(["standard", "thorough", "rigorous"]).optional(),
});

// --- Section schemas ---

export const updateSectionSchema = z.object({
  content: contentString().optional(),
  prompts: z.array(z.string().max(2000)).optional(),
  promptResponses: z.union([
    z.record(z.string(), z.union([
      z.string().max(10_000),
      z.object({
        answer: z.string().max(10_000),
        source: z.enum(["team", "code"]).optional(),
      }),
    ])),
    z.string().max(200_000), // Allow JSON string passthrough (agent sends stringified)
  ]).optional(),
});

export const updateFlagSchema = z.object({
  status: z.enum(["OPEN", "ACCEPTED", "RESOLVED"]),
  resolution: z.string().max(2000).optional(),
});

// --- Session message schema ---

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(50_000),
  sectionId: z.string().max(100).optional().nullable(),
  displayContent: z.string().max(1000).optional(),
});

// --- Helper ---

/** Parse and validate request body. Returns { data } or { error } response. */
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { success: false, error: issues };
  }
  return { success: true, data: result.data };
}

// --- Safe JSON parse ---

/** Parse JSON string with a fallback value. Never throws. */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
