import type { TemplateSection } from "../types.js";

/**
 * Default Incident Analysis template — derived from "Why We Still Suck at Resilience"
 * by Adrian Hornsby. 14 sections, 99 prompts.
 *
 * Learning-focused incident analysis: not a postmortem template filler,
 * but a conversation guide that helps teams extract deep understanding.
 */
export const INCIDENT_TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    position: 1,
    title: "Incident Details",
    prompts: [
      "What is the incident date and time? (include timezone)",
      "What was the total duration from start to full resolution?",
      "What is the severity based on customer impact? (High/Medium/Low)",
      "How was the incident first detected? (monitoring alert, customer report, internal observation, etc.)",
    ],
  },
  {
    position: 2,
    title: "Owner & Review Committee",
    prompts: [
      "Who is leading the analysis process?",
      "Who will peer-review the analysis before publishing?",
      "Who participated in the incident response?",
    ],
  },
  {
    position: 3,
    title: "Classification",
    prompts: [
      "What tags classify this event for future search and pattern analysis? (e.g., Configuration, Database, Dependency, Latent-defect, Capacity, Deployment)",
      "What is the incident type? (Outage, Degradation, Near-miss, Surprising-behavior)",
      "What services and components played a role?",
    ],
  },
  {
    position: 4,
    title: "Executive Summary",
    prompts: [
      "What happened, in plain language?",
      "Why did it matter — what was the impact on customers and the business?",
      "What did we learn? (2-3 key insights)",
      "What are the top 3 action items to address what we learned?",
    ],
  },
  {
    position: 5,
    title: "Supporting Data",
    prompts: [
      "What metric graphs or data show the impact and progression of the incident?",
      "What does the data show about system behavior before, during, and after the event?",
      "What evidence supports your analysis and conclusions?",
    ],
  },
  {
    position: 6,
    title: "Customer Impact",
    prompts: [
      "How many customers were affected? (specific number or percentage)",
      "Which regions or locations were affected?",
      "What features or capabilities were degraded or unavailable?",
      "How long did customers experience issues?",
      "What was the business impact? (revenue loss, SLA breaches, reputation impact)",
    ],
  },
  {
    position: 7,
    title: "Incident Response Analysis",
    prompts: [
      "Was the event detected within the expected time? How could detection be improved?",
      "How did responders know what actions to take?",
      "What runbooks or procedures were used? How well did they work?",
      "What communication challenges occurred during response?",
      "How did you confirm the event was fully resolved?",
      "Did notifications and escalations work appropriately?",
    ],
  },
  {
    position: 8,
    title: "Post-Incident Analysis",
    prompts: [
      "How were the contributing factors diagnosed? What made diagnosis difficult or easy?",
      "How could time to diagnosis be improved?",
      "Did a change trigger this event? How was it deployed? Could safeguards have caught this?",
      "Was this change tested? Why didn't testing catch this issue?",
      "Did you have backlog items that could have addressed this? Why weren't they prioritized?",
      "When was the last operational readiness review conducted on this system?",
    ],
  },
  {
    position: 9,
    title: "Timeline",
    prompts: [
      "Walk me through the incident chronologically. When was the first sign something was wrong?",
      "What happened next? What actions were taken and when?",
      "When was the incident fully resolved and confirmed?",
    ],
  },
  {
    position: 10,
    title: "Contributing Factors Analysis",
    prompts: [
      // Discovery & Context
      "How did you first become aware of the issue? What were you working on?",
      "What were the operational conditions when the incident happened?",
      "What was the state of the system before the incident? Were there recent changes?",
      // Decision-Making Under Uncertainty (The Second Story)
      "What options did responders consider at various points? How did they decide which action to take?",
      "What constraints (time, resources, access) influenced decisions?",
      "What information would have been helpful but wasn't available?",
      "How did actions make sense to everyone involved at the time? What would they have needed to know to act differently?",
      // Organizational Context & Pressures
      "What trade-offs do you regularly navigate in your work?",
      "Were there organizational pressures (deadlines, resource constraints) that influenced decisions?",
      "What competing priorities existed? What were we afraid to talk about before this happened?",
      // Human Factors & Working Conditions
      "Were there signs of fatigue, stress, or high workload? How long had responders been working?",
      "Were there distractions or interruptions? Did responders feel adequately prepared?",
      // Communication & Coordination
      "Was critical information shared effectively? Were there misunderstandings or communication gaps?",
      "Who knew things that others didn't? Were there barriers to speaking up about concerns?",
      "How did handoffs between teams work?",
      // Technical Systems & Environment
      "Was all equipment and tooling functioning as expected?",
      "Were monitoring systems providing the right information?",
      "What assumptions about system behavior proved incorrect?",
      // Propagation & Cascades
      "Why did a localized problem cause broader impact? What coupling or dependencies allowed failure to propagate?",
      "Why didn't isolation mechanisms contain the failure? How did resilience mechanisms (circuit breakers, timeouts, retries) behave?",
      "What about this propagation pattern was surprising?",
      // Warning Signs & Missed Signals
      "Were there warning signs or precursors to this incident?",
      "What near-misses have occurred that might relate? Were relevant concerns raised before but not addressed?",
      "What signals were available but not recognized as important at the time?",
      // Knowledge & Preparedness
      "Did responders have the necessary knowledge and training for this situation?",
      "Were procedures and documentation accessible and accurate?",
      "What knowledge gaps became apparent? Where was critical knowledge concentrated rather than distributed?",
    ],
  },
  {
    position: 11,
    title: "Surprises & Learning",
    prompts: [
      // WAI-WAD Gap Discovery
      "Where did Work-as-Imagined diverge from Work-as-Done?",
      "What assumptions about how the system works proved incorrect?",
      "What assumptions about how operations work proved incorrect?",
      // Surprises & Updated Mental Models
      "What surprised you most during this incident?",
      "What mental models need updating based on this event?",
      "How did the system fail differently than you anticipated?",
      // What Worked Well
      "What worked better than expected? What adaptations prevented worse outcomes?",
      "What knowledge or skills proved valuable during response?",
      // Systemic Patterns
      "Have you seen incidents with similar characteristics before?",
      "What patterns across incidents suggest systemic issues rather than isolated failures?",
      "What does this incident reveal about how the organization thinks, designs, or operates?",
    ],
  },
  {
    position: 12,
    title: "Action Items",
    prompts: [
      "What technical improvements are needed? (system design, monitoring, tooling, infrastructure)",
      "What process improvements are needed? (review procedures, escalation, documentation, testing)",
      "What organizational improvements are needed? (training, workload, psychological safety, decision support)",
      "What learning investments should we make? (practice exercises, knowledge sharing, mental model documentation)",
    ],
  },
  {
    position: 13,
    title: "Learning Loops & Knowledge Sharing",
    prompts: [
      "What chaos experiments should we design based on what this incident revealed?",
      "What load testing scenarios does this incident suggest?",
      "What should future operational readiness reviews examine based on this incident? What questions should we add to our ORR template?",
      "What coordination scenarios should we practice in GameDays based on this incident?",
      "How will we share findings with related teams? What runbooks or documentation need updating?",
      "What training or education should result from this incident?",
      "Which other teams might benefit from these insights? When will we check that action items are completed and effective?",
    ],
  },
  {
    position: 14,
    title: "Quality Checklist",
    prompts: [
      "Is the analysis blameless and focused on systems, not individuals?",
      "Are second stories captured — do we understand why actions made sense at the time?",
      "Do contributing factors go beyond immediate technical causes?",
      "Is the timeline complete with supporting evidence?",
      "Do action items address contributing factors, not just symptoms?",
      "Are surprises and learning insights captured?",
      "Are WAI-WAD gaps identified — do we know where imagined diverged from actual?",
      "Are learning loops documented — will insights inform other practices?",
      "Is a knowledge sharing plan in place to spread lessons?",
      "Do all action items have owners and realistic timelines?",
      "Is customer impact clearly quantified?",
      "Does supporting data validate the conclusions?",
      "Have patterns across incidents been considered — did we look for systemic issues?",
    ],
  },
];

export const INCIDENT_TEMPLATE_NAME = "Default Incident Analysis Template";

export const INCIDENT_TOTAL_PROMPTS = INCIDENT_TEMPLATE_SECTIONS.reduce(
  (sum, s) => sum + s.prompts.length,
  0,
);
