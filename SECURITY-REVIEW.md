# Security Review — Resilience Companion

**Date**: 2026-03-30
**Scope**: Full codebase audit (API, Web, Agent system)
**Context**: Pre-customer review
**Last updated**: 2026-03-30 (post-remediation re-audit)

---

## Remediation Status

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Stub authentication | CRITICAL | **Open** — acceptable for single-user self-hosted deployment |
| 2 | Default JWT_SECRET | HIGH | **Fixed** — throws if unset or default when encrypting tokens |
| 3 | No input validation | HIGH | **Fixed** — zod schemas on all POST/PATCH routes |
| 4 | SSE event injection | MEDIUM | **Open** — low risk (LLM is trusted source, JSON.stringify escapes `\n`) |
| 5 | Unguarded JSON.parse() | MEDIUM | **Fixed** — `safeJsonParse()` across all routes, context, and tools |
| 6 | No rate limiting | MEDIUM | **Open** — not yet implemented |
| 7 | No security headers | LOW | **Fixed** — X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| 8 | CORS hardcoded | LOW | **Fixed** — configurable via `CORS_ORIGINS` env var |

---

## Open Findings

### 1. Stub Authentication (CRITICAL)

**File**: `packages/api/src/middleware/auth.ts`

Authentication is a stub — every request gets the first user from the database regardless of credentials. No JWT verification, no session validation, no password checks.

**Impact**: Any network-reachable client has full access to all data.

**Acceptable when**: Single-user, self-hosted, behind VPN/firewall (the current target). Must be implemented before multi-user or internet-exposed deployment. The JWT infrastructure (jose) is already in package.json.

---

### 4. SSE Event Injection (MEDIUM)

**File**: `packages/api/src/practices/shared/session-routes.ts` (SSE streaming)

LLM responses are serialized via `JSON.stringify()` into SSE `data:` fields. `JSON.stringify()` escapes `\n` as `\\n` in string values, which prevents bare newline injection in practice. The Hono `streamSSE` helper also handles multi-line data correctly per the SSE spec.

**Residual risk**: Theoretical only — would require the LLM to output content that bypasses JSON string escaping, which `JSON.stringify()` prevents.

**Recommendation**: Add an integration test confirming multi-line LLM output doesn't break SSE framing.

---

### 6. No Rate Limiting (MEDIUM)

No rate limiting on any endpoint. Relevant for:
- Message sending (each triggers an LLM call — cost amplification)
- Git clone operations (each clones a repo to disk)
- Session creation

**Mitigation**: The daily token cap (`MAX_DAILY_TOKENS`) limits LLM cost exposure. Git clones are deduped by URL hash.

**Recommendation**: Add rate limiting middleware on `/messages` and git operations before multi-user deployment.

---

## Fixed Findings

### 2. JWT_SECRET Guard (was HIGH — **Fixed**)

**File**: `packages/api/src/git.ts:145-150`

```typescript
function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "change-me-in-production") {
    throw new Error("JWT_SECRET must be set to a unique value (not the default). Token encryption depends on it.");
  }
  return createHash("sha256").update(secret).digest();
}
```

The default fallback has been removed. Token encryption now throws immediately if `JWT_SECRET` is unset or still the placeholder value. The app works without git repos; the check only fires when encrypting/decrypting PATs.

---

### 3. Input Validation (was HIGH — **Fixed**)

**File**: `packages/api/src/validation.ts`

All POST/PATCH endpoints now validate input with zod schemas:

| Route | Schema |
|-------|--------|
| `POST /api/v1/orrs` | `createOrrSchema` — serviceName required (1-255 chars), optional templateId, repositoryUrl (URL format), repositoryToken |
| `PATCH /api/v1/orrs/:id` | `updateOrrSchema` — enum-validated status, steeringTier; URL-validated repositoryUrl |
| `POST /api/v1/incidents` | `createIncidentSchema` — title required (1-500 chars), optional nullable serviceName, severity, incidentType |
| `PATCH /api/v1/incidents/:id` | `updateIncidentSchema` — enum-validated status, steeringTier |
| `PATCH /sections/:id` | `updateSectionSchema` — content max 100K chars, prompts array of strings, promptResponses validated |
| `PATCH /sections/:id/flags/:idx` | `updateFlagSchema` — enum status (OPEN/ACCEPTED/RESOLVED), optional resolution |
| `POST /sessions/:id/messages` | `sendMessageSchema` — content required (1-50K chars), optional sectionId, displayContent |

Invalid input returns `400` with specific field-level error messages.

---

### 5. Safe JSON Parsing (was MEDIUM — **Fixed**)

All `JSON.parse()` calls on database-sourced values now use `safeJsonParse()` with typed fallbacks. Never throws on malformed data.

**Files fixed** (20+ call sites):
- `routes/`: orrs, sections, incidents, incident-sections, export, incident-export, flags, teaching-moments, case-studies
- `practices/shared/context.ts`: section summaries, active section detail, teaching moment tag matching, case study lessons
- `practices/shared/tools.ts`: set_flags, query_teaching_moments, update_question_response
- `practices/shared/session-routes.ts`: sectionsDiscussed parsing

**Already safe** (pre-existing try-catch): `routes/learning.ts`, `agent/loop.ts`, `agent/hooks/`, `llm/anthropic.ts`, `db/seed.ts`

---

### 7. Security Headers (was LOW — **Fixed**)

**File**: `packages/api/src/app.ts`

All responses now include:
- `X-Content-Type-Options: nosniff` — prevents MIME type sniffing
- `X-Frame-Options: DENY` — prevents clickjacking via iframe embedding
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage

---

### 8. Configurable CORS (was LOW — **Fixed**)

**File**: `packages/api/src/app.ts`

CORS origins are now configurable via `CORS_ORIGINS` environment variable (comma-separated). Defaults to `http://localhost:5173,http://localhost:3000` for development.

```bash
# Example for production
CORS_ORIGINS=https://my-app.example.com
```

---

## Positive Findings (Things Done Well)

| Area | Assessment |
|------|-----------|
| **SQL Injection** | Not possible — Drizzle ORM with parameterized queries throughout |
| **Command Injection** | Safe — all `execFileSync` calls use array arguments, no shell mode |
| **Path Traversal** | Solid — dual logical + real path validation with symlink resolution in `resolveRepoPath()` |
| **Credential Leakage** | Multi-layer defense — sensitive file patterns block reads, content-scan hook redacts secrets from results, 10KB cap |
| **XSS** | Safe — custom React markdown renderer, no `dangerouslySetInnerHTML` anywhere |
| **Git Operations** | HTTPS-only, no embedded credentials, terminal prompts disabled, tokens encrypted at rest, errors sanitized |
| **Team Data Scoping** | All queries filter by `teamId` (effective once auth is real) |
| **LLM Prompt Injection** | User input is data, not code — system prompt is fixed, tool args are JSON-validated |
| **Input Validation** | zod schemas on all write endpoints with field-level errors |
| **JSON Safety** | `safeJsonParse()` with typed fallbacks — no unhandled parse exceptions |

---

## Summary

| Severity | Total | Fixed | Open |
|----------|-------|-------|------|
| CRITICAL | 1 | 0 | 1 (auth stub — acceptable for target deployment) |
| HIGH | 2 | 2 | 0 |
| MEDIUM | 3 | 1 | 2 (SSE theoretical, rate limiting deferred) |
| LOW | 2 | 2 | 0 |

**For single-user, self-hosted, behind-firewall deployment** (the current target): all actionable issues are resolved. The auth stub is a known design decision, not a bug. Rate limiting and SSE hardening are deferred to multi-user deployment.

**Remaining work for multi-user deployment**:
- Implement real authentication (OIDC/JWT)
- Add rate limiting on message and git endpoints
- Add SSE framing integration test
