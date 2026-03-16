import { eq, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  DEFAULT_TEMPLATE_SECTIONS,
  DEFAULT_TEMPLATE_NAME,
} from "@orr/shared";
import type { Db } from "./connection.js";
import * as schema from "./schema.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function findSeedDataPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return resolve(__dirname, "../../../../scripts/seed-data/curated-incidents.json");
}

export async function seed(db: Db) {
  const now = new Date().toISOString();

  // Migrate: add prompt_responses column if it doesn't exist
  try {
    (db as any).run("ALTER TABLE sections ADD COLUMN prompt_responses TEXT NOT NULL DEFAULT '{}'");
  } catch {
    // Column already exists — ignore
  }

  // Seed default team and user (single-tenant, no login)
  const existingUser = db.select().from(schema.users).limit(1).get();
  if (!existingUser) {
    const teamId = nanoid();
    db.insert(schema.teams)
      .values({ id: teamId, name: "My Team", createdAt: now })
      .run();
    db.insert(schema.users)
      .values({
        id: nanoid(),
        name: "Default User",
        email: "user@localhost",
        passwordHash: "n/a",
        teamId,
        role: "ADMIN",
        authProvider: "local",
        createdAt: now,
      })
      .run();
    console.log("Seeded default team and user");
  }

  // Seed default template
  const existingTemplate = db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.isDefault, true))
    .get();

  if (!existingTemplate) {
    const templateId = nanoid();
    db.insert(schema.templates)
      .values({
        id: templateId,
        name: DEFAULT_TEMPLATE_NAME,
        isDefault: true,
        sections: JSON.stringify(DEFAULT_TEMPLATE_SECTIONS),
        createdBy: null,
        createdAt: now,
      })
      .run();
    console.log(`Seeded default template: ${DEFAULT_TEMPLATE_NAME}`);
  }

  // Seed teaching moments and case studies from curated incidents
  const tmCount = db.select({ value: count() }).from(schema.teachingMoments).get();
  const csCount = db.select({ value: count() }).from(schema.caseStudies).get();

  if (tmCount?.value === 0 || csCount?.value === 0) {
    try {
      const seedPath = findSeedDataPath();
      const raw = readFileSync(seedPath, "utf-8");
      const data = JSON.parse(raw);

      if (tmCount?.value === 0 && data.teachingMoments) {
        for (const tm of data.teachingMoments) {
          db.insert(schema.teachingMoments)
            .values({
              id: nanoid(),
              title: tm.title,
              content: tm.content,
              source: "PUBLIC",
              sourceOrrId: null,
              attributedTo: null,
              status: "PUBLISHED",
              tags: JSON.stringify(tm.tags),
              sectionTags: JSON.stringify(tm.sectionTags),
              systemPattern: tm.systemPattern || null,
              failureMode: tm.failureMode || null,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        }
        console.log(`Seeded ${data.teachingMoments.length} teaching moments from public incidents`);
      }

      if (csCount?.value === 0 && data.caseStudies) {
        for (const cs of data.caseStudies) {
          db.insert(schema.caseStudies)
            .values({
              id: nanoid(),
              title: cs.title,
              company: cs.company,
              year: cs.year || null,
              summary: cs.summary,
              sourceUrl: cs.sourceUrl || null,
              failureCategory: cs.failureCategory,
              sectionTags: JSON.stringify(cs.sectionTags),
              lessons: JSON.stringify(cs.lessons),
              createdAt: now,
            })
            .run();
        }
        console.log(`Seeded ${data.caseStudies.length} case studies from public incidents`);
      }
    } catch (err) {
      console.warn("Could not load seed data:", (err as Error).message);
    }
  }
}
