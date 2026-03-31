# Security Readiness Review — Practice Design

## Context

The Resilience Companion currently supports ORRs (operational readiness reviews) and will add incident analysis. The user wants to add a **Security Readiness Review** as a third practice — the security equivalent of an ORR. It must be:

- **Best of security**: Drawing from NIST CSF 2.0, STRIDE, PASTA, Zero Trust, SLSA, OWASP ASVS, purple teaming, security chaos engineering
- **In the book's style**: Conversational, WAI-vs-WAD probing, learning-oriented, "walk me through" framing — not compliance checklists
- **Integrated with existing practices**: Cross-practice linking (security findings → ORR updates, chaos experiments, incident analysis)

The ORR already asks one surface question ("Describe the security review process for your service") and explicitly notes: *"Security must have its own, in-depth review."* This practice is that review.

**Core philosophy**: The gap between security-as-imagined (threat models, architecture docs, compliance certifications) and security-as-practiced (what actually happens under attack, what controls actually work, what assumptions are wrong) is the most dangerous gap in any organization. This review discovers that gap through conversation.

---

## 10 Sections, ~95 Prompts

### 1. Threat Landscape & Attack Surface (10 prompts)

*What are you defending, from whom, and where are the edges?*

Maps to: NIST Identify, STRIDE threat categories, PASTA attacker profiling, attack surface analysis.

1. What does your service do, and what makes it valuable to an attacker? Think about the data it holds, the systems it can reach, and the trust other services place in it.
2. Walk me through your threat model. Who are your adversaries (opportunistic, targeted, insider, supply chain), and what are their likely objectives?
3. Describe every entry point into your system — APIs, UIs, admin interfaces, background jobs, message queues, file uploads. Which ones are internet-facing?
4. What trust boundaries exist in your architecture? Draw me the line between "trusted" and "untrusted" at every layer — network, application, data, identity.
5. Which components, if compromised, would give an attacker the broadest lateral movement? What's the blast radius of your most privileged service account?
6. When did you last update your threat model? What changed in the threat landscape, your architecture, or your assumptions since then?
7. Tell me about a threat you've discovered recently that wasn't in your original threat model. What assumptions changed?
8. What attack surface have you deliberately accepted rather than eliminated? What's the rationale, and when do you revisit that decision?
9. How do you track changes to your attack surface as features ship? Does your threat model evolve with your architecture, or is it a point-in-time artifact?
10. What's the attack you're most worried about that you haven't fully mitigated? What makes it hard to address?

**Depth signals:**
- Surface: Can name adversary types and list entry points
- Moderate: Explains trust boundaries, blast radius, accepted risks with rationale
- Deep: Describes threat model evolution, recently discovered threats not in original model, articulates the attack they can't fully mitigate and why

---

### 2. Identity, Authentication & Access Control (10 prompts)

*Who can access what, how do you know, and what happens when credentials are compromised?*

Maps to: Zero Trust ("never trust, always verify"), NIST Protect, IAM, least privilege, credential lifecycle.

1. Walk me through your authentication architecture. How do users, services, and machines prove their identity? Where is each credential validated?
2. Describe your authorization model. How do you decide what an authenticated entity can do? Is it role-based, attribute-based, resource-based — and where is the policy enforced?
3. How do you implement least privilege? Show me the most privileged account in your system — who has it, why, and when was that last reviewed?
4. What happens when a credential is compromised — a user password, an API key, a service account token? Walk me through detection, revocation, and blast radius containment.
5. How do you manage secrets (API keys, database credentials, signing keys)? Where are they stored, how are they rotated, and what breaks if rotation fails?
6. Describe your service-to-service authentication. Is it mutual TLS, tokens, shared secrets? What happens if one service's identity is spoofed?
7. What access do third-party integrations and vendors have? How are those credentials scoped, rotated, and monitored? What's the blast radius of a compromised vendor account?
8. Walk me through your last access review or audit. What surprised you? What access existed that shouldn't have?
9. How do you handle break-glass access — emergency elevation of privileges during incidents? Who can do it, how is it logged, and how is it reversed?
10. What's the gap between your intended access model and what's actually true in production right now? Where does reality diverge from design?

**Depth signals:**
- Surface: Can describe auth mechanisms and secret storage
- Moderate: Explains least privilege enforcement, credential rotation, vendor access scoping
- Deep: Describes access review surprises, gap between intended and actual access, break-glass process with real examples

---

### 3. Data Protection & Flow (10 prompts)

*Where does sensitive data live, move, and leak — and what happens when protections fail?*

Maps to: NIST Protect (data security), data flow diagrams, GDPR/privacy, encryption, classification.

1. What sensitive data does your service handle — PII, credentials, financial data, health data, business secrets? How is it classified, and who owns the classification?
2. Walk me through the complete lifecycle of your most sensitive data: where it enters, where it's processed, where it's stored, where it's transmitted, and where it's destroyed. Include caches, logs, error messages, and backups.
3. How is data encrypted at rest and in transit? Where are the encryption keys, who can access them, and what's your key rotation strategy?
4. What happens to sensitive data in non-production environments — dev, staging, CI? Is it real data, anonymized, synthetic? How do you prevent production data from leaking into lower environments?
5. Where might sensitive data appear that you didn't intend — log files, error messages, analytics, monitoring dashboards, third-party APIs, browser local storage?
6. What's your data retention policy, and how is deletion actually enforced? Can you prove that deleted data is truly gone from all stores, backups, and caches?
7. How do you handle data subject requests (access, deletion, portability)? Walk me through the last one — what was easy and what was hard?
8. What data crosses geographic or regulatory boundaries? How do you ensure compliance with jurisdictional requirements?
9. If an attacker exfiltrates your database, what do they actually get? What's the delta between "encrypted at rest" and "practically useful to an attacker"?
10. What's the most surprising place you've found sensitive data that shouldn't have been there?

**Depth signals:**
- Surface: Knows what sensitive data exists and encryption approach
- Moderate: Can trace data flow through lifecycle, identifies non-obvious storage locations
- Deep: Describes real examples of data leaking to unexpected places, explains practical attacker value of exfiltrated data, handles retention/deletion with verified enforcement

---

### 4. Supply Chain & Dependencies (8 prompts)

*What do you trust, and what happens when that trust is violated?*

Maps to: SLSA framework, SBOM, dependency management, the axios-style supply chain attack.

1. How many direct and transitive dependencies does your service have? When did you last audit them? Do you know what each critical dependency does?
2. Walk me through what happens when you add a new dependency. Who reviews it? What criteria determine whether a package is trustworthy?
3. What protections do you have against a compromised dependency — lockfiles, integrity checks, install script restrictions, provenance verification? Walk me through each layer.
4. How do you track and respond to vulnerabilities in your dependencies? What's your SLA from CVE publication to patched deployment? Show me the last critical CVE — how long did it actually take?
5. What build-time dependencies have production access or influence? Could a compromised CI plugin, build tool, or test framework affect your production artifacts?
6. How do you verify that the code you reviewed is the code that runs in production? Walk me through the chain from source commit to production binary — where could substitution happen?
7. What container base images do you use, and how are they maintained? Who controls them, when are they rebuilt, and what's in them that you haven't explicitly chosen?
8. If a critical dependency were compromised tomorrow (like the axios or xz-utils attacks), how quickly would you detect it, and what's your response plan?

**Depth signals:**
- Surface: Has lockfiles and runs npm audit
- Moderate: Describes dependency review process, knows vulnerability SLA, has CI protections
- Deep: Can trace source-to-production chain integrity, has response plan for supply chain compromise, understands build-time attack surface

---

### 5. Detection & Security Monitoring (12 prompts)

*Can you see attacks happening, and how do you know you're not blind?*

Maps to: NIST Detect, SIEM/SOAR, behavioral analytics, purple team detection coverage, MITRE ATT&CK.

1. What security events does your service generate? Walk me through the logs and telemetry an attacker would create during reconnaissance, initial access, and lateral movement.
2. How do you distinguish between a security incident and normal operational noise? What signals separate an attack from a bad deployment or an upstream outage?
3. What's your mean time from compromise to detection? Not the target — the measured reality from your last incident or exercise.
4. Walk me through your alerting pipeline for security events. Where are logs collected, how are they analyzed, who gets paged, and what's the expected response time?
5. What attack patterns do you have explicit detection for? Map these against a framework like MITRE ATT&CK — where are you covered, and where are you blind?
6. How do you detect unauthorized data access or exfiltration? If someone with valid credentials started downloading your entire database, would you notice? How quickly?
7. What happens to your security visibility if your logging or monitoring infrastructure fails? Have you tested operating with degraded observability?
8. How do you detect changes to your own security controls — firewall rules modified, WAF disabled, permissions broadened? Who monitors the monitors?
9. What behavioral baselines have you established? Can you detect anomalous patterns (unusual access times, atypical data volumes, new network connections) versus just known-bad signatures?
10. Walk me through the last security alert that turned out to be a true positive. What worked in detection? What was slow or manual?
11. Walk me through the last security alert that was a false positive. What caused it? How much time did it waste, and what did you change?
12. What security-relevant events are you generating but not monitoring? What are you monitoring but not alerting on? Where is the gap between what you could see and what you actually look at?

**Depth signals:**
- Surface: Has logging and some alerts
- Moderate: Can map detection coverage, knows blind spots, describes alert pipeline
- Deep: Measures actual detection time, tests under degraded observability, has behavioral baselines, can articulate gaps between available and utilized telemetry

---

### 6. Adversarial Resilience & Testing (10 prompts)

*How do you test your defenses — and how do you know the tests are realistic?*

Maps to: Purple teaming, security chaos engineering, red team, penetration testing, BAS (breach and attack simulation), continuous validation.

1. Describe your security testing program. What types of testing do you do (SAST, DAST, pen testing, red team, bug bounty), how often, and what has each found recently?
2. When was your last penetration test? Walk me through the most significant finding. Was it something your team expected, or a genuine surprise?
3. Have you conducted a red team or purple team exercise against this service? What attack scenarios were tested? What detection gaps were discovered?
4. How do you validate that your security controls actually work — not just that they exist, but that they detect and block real attacks? When was the last time a control was tested and failed?
5. Have you run security chaos experiments — deliberately degrading or disabling security controls to see what happens? What did you learn?
6. How do you ensure your security tests are realistic? Penetration tests that avoid production, use limited scope, or stop at first finding may miss systemic issues. What constraints do your tests operate under, and what might those constraints hide?
7. What attack scenarios have you never tested? What's stopping you — risk, cost, capability, or the belief that they're unlikely?
8. How do your security testing results feed back into your threat model, monitoring, and controls? Show me a specific example where a test finding changed something concrete.
9. If an attacker spent 30 days inside your network undetected, what could they accomplish? Have you tested this dwell-time scenario?
10. What's the most uncomfortable security test result you've had? What did it reveal about assumptions your team held?

**Depth signals:**
- Surface: Does periodic pen testing, runs SAST/DAST
- Moderate: Has purple team exercises, feeds findings back into controls, tests control effectiveness
- Deep: Runs security chaos experiments, tests dwell-time scenarios, can describe a finding that genuinely changed assumptions, articulates what they've never tested and why

---

### 7. Infrastructure & Network Security (9 prompts)

*How are boundaries enforced, and what happens when they're crossed?*

Maps to: Zero Trust network, cloud security, segmentation, hardening, IaC security.

1. Describe your network architecture from a security perspective. What segmentation exists, and what can communicate with what? Where do you enforce boundaries — network layer, application layer, identity layer?
2. How do you implement Zero Trust principles? Where do you still rely on network location as a proxy for trust? What would break if you removed that assumption?
3. Walk me through your cloud security posture. How are cloud resources configured, who can modify configurations, and how do you detect misconfiguration or drift?
4. What infrastructure is managed as code? What isn't? For the parts that aren't, how do you ensure consistency and prevent unauthorized changes?
5. How do you harden your compute environments — servers, containers, serverless functions? What's your patch cadence, and what's the actual time from vulnerability disclosure to patched production?
6. What's your DNS security posture? Could an attacker redirect your traffic through DNS hijacking, and how would you detect it?
7. How do you secure your CI/CD pipeline? What privileges does your build system have, and what happens if a build agent is compromised?
8. Walk me through what happens when a new host or container spins up. What security controls are applied automatically versus manually? What gaps exist in that bootstrapping process?
9. What infrastructure changes have you made recently that might have widened your attack surface without a corresponding security review?

**Depth signals:**
- Surface: Describes network segmentation and cloud provider
- Moderate: Explains Zero Trust implementation, IaC coverage, patch cadence with real numbers
- Deep: Identifies where network-trust assumptions persist, describes CI/CD security posture, tracks infrastructure changes against security review

---

### 8. Incident Response & Recovery (10 prompts)

*When you're breached, what actually happens — not what the plan says?*

Maps to: NIST Respond/Recover, IR playbooks, communication, forensics, business continuity.

1. Walk me through your security incident response plan. Who does what, in what order, using what tools? Where is it documented, and when was it last updated?
2. Who is on your incident response team? Is it dedicated or drawn from other roles? How quickly can you assemble the team at 2am on a Saturday?
3. Walk me through your last security incident (or the most realistic exercise). What happened versus what the plan said should happen? Where did reality diverge from the playbook?
4. How do you preserve forensic evidence during an incident? Can you investigate and contain simultaneously without destroying the evidence you need to understand root cause?
5. What's your communication plan during a security incident? Who gets told what, when — engineering, leadership, legal, customers, regulators, public? Walk me through the decision tree.
6. How do you decide between containing quickly (shutting things down) and investigating thoroughly (keeping systems running to understand the attack)? Who makes that call, and under what pressure?
7. After containment, how do you determine the full scope of a breach? How do you know the attacker is actually gone and hasn't established persistence?
8. What's your recovery process after a security incident? How do you rebuild trust in compromised systems? Do you rebuild from scratch or try to clean?
9. How does your security incident analysis feed back into your defenses? Show me a specific example where an incident (or near-miss) led to a concrete security improvement.
10. What kind of security incident would overwhelm your current response capability? Where does your plan assume resources, skills, or coordination that you might not have?

**Depth signals:**
- Surface: Has an IR plan and knows who to call
- Moderate: Has run exercises, can describe plan-vs-reality divergence, has communication decision tree
- Deep: Describes forensic preservation during live response, articulates containment-vs-investigation tradeoff with real examples, identifies what would overwhelm their capability

---

### 9. Security Governance & Culture (8 prompts)

*Who knows what, who decides what, and does security knowledge compound or concentrate?*

Maps to: NIST CSF 2.0 Govern function, security culture, knowledge distribution, organizational learning.

1. Who owns security for this service — and what does "owns" actually mean in practice? Where does security responsibility sit relative to feature delivery pressure?
2. How do engineers learn about security? Is it training, code review, pairing, incident learning, or osmosis? How do you know it's working?
3. Where is security knowledge concentrated? If your most security-aware person left tomorrow, what would the team lose? What institutional knowledge exists only in their head?
4. How do you make security decisions when requirements conflict with delivery timelines? Walk me through a recent example where security and speed were in tension. What won, and why?
5. How do you track security debt — known vulnerabilities, deferred hardening, accepted risks with expiration dates? Where does it live, and who reviews it?
6. What security improvements have been deprioritized or deferred in the past year? What was the rationale, and has the risk been reassessed since?
7. How do security findings from this service inform other teams, and vice versa? What mechanisms exist for cross-team security learning?
8. What's your team's honest assessment of its own security posture — not the answer for an auditor, but what you'd say to each other behind closed doors?

**Depth signals:**
- Surface: Can name who's responsible and list recent training
- Moderate: Describes security-vs-speed tradeoffs with real examples, tracks security debt
- Deep: Articulates knowledge concentration risk, describes cross-team learning mechanisms, gives honest internal assessment vs audit-ready answer

---

### 10. Security Drift & Assumptions (8 prompts)

*What security assumptions have been quietly invalidated by reality?*

Maps to: Drift into failure, normalized deviance, assumption tracking, continuous validation. This section is unique to the book's framework — it's what makes this review different from every other security framework.

1. What security assumptions did your team hold six months ago that turned out to be wrong or incomplete? How did you discover them?
2. What security controls were implemented in response to a past incident or audit that you've never validated since? Are they still working? Are they still relevant?
3. What security behaviors has your team started accepting as "normal" that weren't happening a year ago — longer patch windows, more exceptions to access policies, quieter alert channels?
4. Where has your actual security posture drifted from your documented security posture? What would an auditor find that doesn't match the architecture diagram?
5. What security practices have you simplified or shortened under time pressure? What was lost in the simplification?
6. How do you detect security drift before it becomes a vulnerability? What signals tell you that your security posture is degrading?
7. What's the security equivalent of "technical debt" in your system — the shortcuts, workarounds, and temporary exceptions that have become permanent?
8. If you were attacking your own system, what would you exploit first? What does your team know is weak but hasn't had the time or mandate to fix?

**Depth signals:**
- Surface: Can list known security gaps
- Moderate: Describes specific examples of assumptions that proved wrong, tracks drift indicators
- Deep: Articulates normalized deviance patterns, describes the gap between documented and actual posture with specifics, can attack their own system mentally and explain what they'd exploit

---

## What Makes This Different From Existing Frameworks

| Existing framework | What it does well | What this review adds |
|---|---|---|
| NIST CSF | Comprehensive taxonomy of security functions | Conversational discovery of WAI-WAD gaps; drift detection |
| OWASP ASVS | Technical verification checklist | "Walk me through" probing for depth vs. checkbox answers |
| AWS Well-Architected | Cloud-specific architectural review | Adversarial thinking, supply chain, security culture |
| Penetration testing | Finds specific vulnerabilities | Examines organizational capacity, knowledge distribution, response capability |
| Compliance audits | Verifies control existence | Tests whether controls actually work and whether the team understands them |
| Threat modeling (STRIDE/PASTA) | Systematic threat enumeration | Probes the *evolution* of threat models, assumption invalidation, and model drift |

**The unique contribution**: Section 10 (Security Drift & Assumptions) doesn't exist in any standard framework. It applies the book's core insight — that practices drift toward theater through locally rational decisions — directly to security posture. This is the section most likely to produce genuine discoveries.

---

## Integration With Resilience Companion

### Practice Type
- New practice type: `security` (alongside `orr` and future `incident`)
- New constant: `PracticeType.SECURITY`
- Status lifecycle: same as ORR (DRAFT → IN_PROGRESS → COMPLETE → ARCHIVED)

### Template
- New file: `packages/shared/src/template/security-template.ts`
- Same structure as `default-template.ts`: sections array with id, title, description, prompts
- Depth model: same 4-level (UNKNOWN → SURFACE → MODERATE → DEEP) with section-specific depth signals as guidance for the AI

### Agent Profile
- New agent profile: `SECURITY_REVIEW_FACILITATOR`
- Persona: Curious adversarial thinker who probes the gap between security-as-designed and security-as-practiced. Doesn't audit compliance — discovers reality. Thinks like an attacker but teaches like a mentor.
- System prompt draws from: STRIDE categories for systematic coverage, PASTA for attacker perspective, Zero Trust for architectural probing, purple team for detection validation

### Cross-Practice Linking
- Security findings → ORR section updates (e.g., security monitoring gaps → ORR monitoring section)
- Security findings → chaos experiment suggestions (e.g., "test what happens when WAF is disabled")
- Security findings → incident analysis connections (e.g., past breach patterns inform current posture)
- Uses existing `crossPracticeSuggestions` table and `suggest_cross_practice_action` tool

### Feature Security Reviews
- Like Feature ORRs, support lightweight change-scoped security reviews
- Reuse the Feature ORR change types that have security relevance: `new_dependency`, `new_endpoint`, `security_boundary_change`, `data_model_change`
- Generate targeted questions from the relevant sections above

---

## Implementation Phases

### Phase 1: Template & Content (this plan)
- Define the 10 sections and ~95 prompts in `security-template.ts`
- Add `PracticeType.SECURITY` to constants
- Add `SECURITY_REVIEW_FACILITATOR` agent profile
- Write the security review system prompt

### Phase 2: Routes & UI
- New routes for security reviews (parallel to orr routes)
- UI: new practice type in dashboard, create flow, review view
- Cross-practice suggestions from security to ORR

### Phase 3: Feature Security Reviews
- Change-scoped security reviews linked to parent security review
- Lightweight template generation per change type

---

## Verification

1. Review the 95 prompts for: learning orientation (not compliance), WAI-WAD probing, "walk me through" style, depth progression, uniqueness from ORR questions
2. Compare coverage against NIST CSF 2.0 six functions — all should be represented
3. Compare coverage against OWASP ASVS top concerns — critical items should appear
4. Ensure Section 10 (Drift) contains questions that no standard framework asks
5. Validate cross-practice links make sense (security finding types → ORR sections)
