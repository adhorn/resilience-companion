import type { TemplateSection } from "../types.js";
import type { ChangeType } from "../constants.js";

/**
 * Feature ORR question bank.
 *
 * Questions are organized by source:
 * 1. Impact questions — "does this change affect what the service ORR established?"
 * 2. Readiness questions — "is the new thing itself operationally ready?" (per change type)
 * 3. Universal questions — always included regardless of change type
 *
 * At creation time, generateFeatureTemplate() assembles the final set based on
 * selected change types and parent ORR sections.
 */

export const FEATURE_TEMPLATE_NAME = "Feature ORR — Change-Scoped Review (generated)";

// --- Impact questions (one per parent ORR section area) ---

export const IMPACT_QUESTIONS: Record<string, string> = {
  "Architecture":
    "Walk me through how this change fits into your existing architecture. What component interactions change? Where does this sit relative to your existing failure domains?",
  "Failures, Impact & Adaptive Capacity":
    "Walk me through the failure modes this change introduces. How do they interact with your existing resilience mechanisms — circuit breakers, retries, timeouts? What breaks differently now?",
  "Monitoring":
    "What new signals do you need to watch? Walk me through how your existing dashboards and alarms change — what gaps open up?",
  "Deployment":
    "How does this change affect your deployment pipeline? Walk me through what a rollback looks like now compared to before.",
  "Operations":
    "Walk me through what changes for on-call. Do runbooks need updating? Does the escalation path change? What does a 3am page look like with this change in place?",
  "Disaster Recovery":
    "How does this change affect your disaster recovery story? Walk me through RTO/RPO — do the numbers still hold? What about failover procedures?",
};

// --- Readiness questions per change type ---

interface ReadinessSection {
  title: string;
  prompts: string[];
}

export const READINESS_QUESTIONS: Record<ChangeType, ReadinessSection[]> = {
  new_dependency: [
    {
      title: "Dependency Readiness",
      prompts: [
        "Describe the new dependency and why you need it. What alternatives did you consider?",
        "Walk me through what happens when this dependency is unavailable. Does your service fail-open or fail-closed? What does the customer see?",
        "What is the SLA/SLO of this dependency? How does it compare to your own service's targets? What happens to your error budget math?",
        "Walk me through your timeout, retry, and backoff strategy for this dependency. How did you pick those numbers?",
        "What rate limits or quotas does this dependency impose? How do you track usage against limits, and what happens as you approach them?",
        "Show me how you monitor the health and latency of this dependency. What does your dashboard look like? What alerts exist?",
        "Walk me through the blast radius if this dependency goes down. Which customer-facing features are affected? Which aren't?",
        "Do you have a fallback or degraded mode? Walk me through what the service looks like with this dependency down — what still works?",
        "How do you test this dependency's failure modes? Have you actually killed it in a test environment and watched what happens?",
        "What data does this dependency have access to? Walk me through the security implications and data flow.",
      ],
    },
  ],
  new_endpoint: [
    {
      title: "Endpoint Readiness",
      prompts: [
        "Describe the new endpoint and who consumes it. Walk me through a typical request flow end to end.",
        "What request volumes do you expect? Walk me through how you arrived at those numbers and what your latency targets are.",
        "Walk me through how the endpoint is authenticated and authorized. What happens when someone sends a request with bad credentials?",
        "What rate limiting and throttling is in place? Walk me through what happens when a consumer hits limits — what do they see?",
        "Walk me through your input validation. What happens with malformed requests? What about intentionally malicious input?",
        "Show me how you monitor this endpoint's availability and latency. What alerts fire, and when?",
        "Walk me through the rollback plan if this endpoint has problems after launch. Can you turn it off without affecting the rest of the service?",
        "How do consumers learn about this endpoint? Walk me through the documentation and versioning story.",
      ],
    },
  ],
  data_model_change: [
    {
      title: "Data Model Readiness",
      prompts: [
        "Describe what's changing in the data model and why. Walk me through the before and after.",
        "Walk me through your migration strategy. Is it online or offline? Rolling or big-bang? What drove that choice?",
        "Walk me through the rollback plan if the migration fails mid-way. What state is the data in? Can you recover?",
        "How do you handle the transition period where old and new schemas coexist? Walk me through what happens to in-flight requests during migration.",
        "What's the expected data volume? Walk me through how the migration scales — what happens with your largest tables?",
        "How do you validate data integrity after migration? Walk me through your validation process and what happens if something doesn't match.",
        "What downstream systems or consumers are affected by this schema change? Walk me through who else reads this data.",
        "Walk me through your backup strategy before migration begins. When did you last restore from a backup to verify it works?",
      ],
    },
  ],
  scaling_change: [
    {
      title: "Scaling Readiness",
      prompts: [
        "Describe the new scaling dimension or capacity model. Walk me through what changes and why.",
        "What triggers scaling and what are the new limits? Walk me through the boundary conditions — what happens at the edges?",
        "How do you test the new scaling behavior under load? Walk me through your load testing plan and what you're watching for.",
        "Walk me through what happens when scaling hits its limits. What's the degradation path? What does the customer experience?",
        "How does this affect your cost model? Walk me through the economics — any surprises?",
        "Show me the monitoring that tells you scaling is working as expected. What signals would tell you it's not?",
      ],
    },
  ],
  infrastructure_change: [
    {
      title: "Infrastructure Readiness",
      prompts: [
        "Describe what infrastructure is changing and why. What are you moving from and to?",
        "Walk me through the migration or transition plan. What's the sequence? Where are the points of no return?",
        "Walk me through the rollback plan. How far into the transition can you still go back? What happens if you need to roll back after the point of no return?",
        "How do you validate the new infrastructure before cutting over? Walk me through your confidence-building steps.",
        "What monitoring gaps exist during the transition? Walk me through the period where you're between old and new — what can you see, what can't you see?",
        "How does this affect your disaster recovery posture? Walk me through DR with the new infrastructure — does everything still work?",
      ],
    },
  ],
  security_boundary_change: [
    {
      title: "Security Boundary Readiness",
      prompts: [
        "Describe what trust boundary is changing. Walk me through the before and after — who could access what, and who can now?",
        "How do you validate the new security model before deployment? Walk me through your verification approach.",
        "Walk me through the blast radius if the new security boundary is misconfigured. What's the worst case? What data is exposed?",
        "What audit logging exists for the new boundary? Show me what you'd look at if you suspected unauthorized access.",
        "How does this affect your compliance posture? Walk me through which compliance requirements are affected and how you'll demonstrate adherence.",
      ],
    },
  ],
  failure_domain_change: [
    {
      title: "Failure Domain Readiness",
      prompts: [
        "Describe what isolation boundary is changing. Walk me through the failure domains before and after.",
        "How have you validated the new blast radius? Walk me through your testing — have you actually failed components within the new boundaries?",
        "Walk me through what happens if the isolation fails. What's the worst-case impact? Who gets affected that wasn't affected before?",
        "How do you test the new failure domain boundaries? Walk me through how you know the isolation actually works.",
        "Does this affect your multi-AZ or multi-region story? Walk me through how this change interacts with your availability architecture.",
      ],
    },
  ],
};

// --- Universal questions (always included) ---

export const UNIVERSAL_QUESTIONS: string[] = [
  "Walk me through your rollback plan if this change causes problems in production. How long does it take? What state is the system in mid-rollback?",
  "How will you validate this change in production before full rollout? Walk me through your canary, feature flag, or progressive deployment strategy.",
  "What's your confidence level in the monitoring for this change? Walk me through the blind spots — what could go wrong that you wouldn't see?",
  "What could go wrong that you haven't considered? What assumptions are you making that you haven't validated?",
  "Who needs to know about this change? Walk me through the communication — dependent teams, on-call, support. What happens if they're surprised by it?",
];

// --- Template generator ---

interface ParentSectionInfo {
  title: string;
  hasContent: boolean;
}

/**
 * Generate the Feature ORR template sections based on selected change types
 * and optionally the parent ORR's sections.
 *
 * Returns TemplateSection[] in the same shape used by the existing system,
 * ready to be persisted as section rows.
 */
export function generateFeatureTemplate(
  changeTypes: ChangeType[],
  parentSections?: ParentSectionInfo[],
): TemplateSection[] {
  const sections: TemplateSection[] = [];
  let position = 1;

  // 1. Impact questions — one per relevant parent section area
  const impactPrompts: string[] = [];
  if (parentSections && parentSections.length > 0) {
    // Include impact questions for parent sections that have content
    for (const ps of parentSections) {
      const matchedKey = Object.keys(IMPACT_QUESTIONS).find(
        (k) => ps.title.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(ps.title.toLowerCase().split(",")[0]),
      );
      if (matchedKey && ps.hasContent) {
        impactPrompts.push(IMPACT_QUESTIONS[matchedKey]);
      }
    }
  } else {
    // No parent — include all impact questions, framed as baseline checks
    impactPrompts.push(...Object.values(IMPACT_QUESTIONS));
  }

  if (impactPrompts.length > 0) {
    sections.push({
      position: position++,
      title: "Impact on Existing Service",
      prompts: impactPrompts,
    });
  }

  // 2. Readiness questions — grouped by section title, deduplicated across change types
  const readinessByTitle = new Map<string, string[]>();
  for (const ct of changeTypes) {
    const ctSections = READINESS_QUESTIONS[ct];
    if (!ctSections) continue;
    for (const rs of ctSections) {
      const existing = readinessByTitle.get(rs.title) || [];
      for (const prompt of rs.prompts) {
        if (!existing.includes(prompt)) {
          existing.push(prompt);
        }
      }
      readinessByTitle.set(rs.title, existing);
    }
  }

  for (const [title, prompts] of readinessByTitle) {
    sections.push({
      position: position++,
      title,
      prompts,
    });
  }

  // 3. Universal questions — always last
  sections.push({
    position: position++,
    title: "General Readiness",
    prompts: UNIVERSAL_QUESTIONS,
  });

  return sections;
}

/** Total prompts for a given set of change types (for display in UI) */
export function countFeaturePrompts(
  changeTypes: ChangeType[],
  parentSections?: ParentSectionInfo[],
): { sections: number; prompts: number } {
  const template = generateFeatureTemplate(changeTypes, parentSections);
  return {
    sections: template.length,
    prompts: template.reduce((sum, s) => sum + s.prompts.length, 0),
  };
}
