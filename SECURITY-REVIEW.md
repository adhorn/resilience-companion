# Security Review — Resilience Companion

**Date**: 2026-03-30
**Scope**: Full codebase audit (API, Web, Agent system)
**Context**: Pre-customer review

---

## Critical Findings

### 1. Stub Authentication (CRITICAL)

**File**: `packages/api/src/middleware/auth.ts`

Authentication is a stub — every request gets the first user from the database regardless of credentials. No JWT verification, no session validation, no password checks.

**Impact**: Any network-reachable client has full access to all data.

**Recommendation**: Implement real authentication before any multi-user or network-exposed deployment. The JWT infrastructure (jose) is already in package.json. For single-user self-hosted use behind a VPN/firewall, this is acceptable if documented.

---

### 2. Default JWT_SECRET (HIGH)

**File**: `.env.example` line 5, `packages/api/src/git.ts` line 145

```typescript
const secret = process.env.JWT_SECRET || "change-me-in-production";
```

The default secret is hardcoded as a fallback. It's used to derive AES-256-GCM encryption keys for git PAT tokens. Anyone with source access can decrypt stored tokens if the default isn't changed.

**Recommendation**: Remove the fallback. Fail at startup if `JWT_SECRET` is not set or is the default value.

---

### 3. No Input Validation on API Endpoints (HIGH)

**Files**: `packages/api/src/routes/orrs.ts`, `sections.ts`, `incidents.ts`, `incident-sections.ts`

POST and PATCH endpoints accept arbitrary payloads with minimal validation:
- No type checking (objects/arrays accepted where strings expected)
- No length limits (100KB+ content accepted)
- No enum validation (severity, incidentType, depth)
- No format validation (dates, IDs)

**Example** — `sections.ts:113`:
```typescript
if (body.content !== undefined) updates.content = body.content;
```

**Impact**: Type confusion, oversized payloads, corrupted data. Not exploitable as XSS today (React renders safely), but a latent vulnerability if rendering changes.

**Recommendation**: Add schema validation with `zod` at route boundaries. ~2 days of work across all routes.

---

### 4. SSE Event Injection (MEDIUM)

**File**: `packages/api/src/routes/sessions.ts:516`

LLM responses are serialized directly into SSE events. If content contains newlines, the SSE format can be broken:

```
data: {"type":"content_delta","content":"hello
data: {"type":"fake_event","injected":true}
```

The frontend SSE parser (`client.ts:241`) splits on `data:` prefix and would parse the injected line as a separate event.

**Impact**: An LLM response could inject fake SSE events. Limited severity since the LLM is trusted, but a malicious prompt could theoretically trigger this.

**Recommendation**: Ensure `JSON.stringify()` escapes newlines in string values (it does by default for `\n` but not for bare newlines in template literals). Verify the Hono SSE writer handles multi-line data fields correctly per the SSE spec. Add a test.

---

### 5. Unguarded JSON.parse() (MEDIUM)

**Files**: 12+ locations across routes — `case-studies.ts:45`, `export.ts:186,199`, `teaching-moments.ts:47`, `learning.ts:64-80`, and others.

`JSON.parse()` on database values without try-catch. If stored JSON is malformed, the endpoint returns a 500 error.

**Note**: `learning.ts` already has proper try-catch patterns — these should be applied consistently.

**Recommendation**: Wrap all `JSON.parse()` calls on database-sourced values in try-catch with sensible defaults.

---

### 6. No Rate Limiting (MEDIUM)

No rate limiting on any endpoint. Particularly relevant for:
- Message sending (each triggers an LLM call — cost amplification)
- Git clone operations (each clones a repo to disk)
- Session creation

**Recommendation**: Add rate limiting middleware, at minimum on `/messages` and git operations.

---

### 7. No Content Security Headers (LOW)

**File**: `packages/api/src/app.ts`

No CSP, X-Frame-Options, or X-Content-Type-Options headers.

**Recommendation**: Add security headers:
```typescript
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'");
});
```

---

### 8. CORS Hardcoded to Localhost (LOW)

**File**: `packages/api/src/app.ts:27-32`

CORS only allows `localhost:5173` and `localhost:3000`. This is correct for development but will break any non-localhost deployment.

**Recommendation**: Make CORS origins configurable via environment variable. The Docker deployment (port 3080) may already be affected.

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

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 1 | Stub authentication |
| HIGH | 2 | Default JWT_SECRET, no input validation |
| MEDIUM | 3 | SSE injection, JSON.parse safety, no rate limiting |
| LOW | 2 | Missing security headers, hardcoded CORS |

**For single-user, self-hosted, behind-firewall deployment** (the current target): the critical auth issue is acceptable if documented. The high/medium issues should be fixed before exposing to untrusted users.

**Estimated remediation effort**: ~1 week total
- Input validation (zod): 2-3 days
- JSON.parse safety: 0.5 day
- Rate limiting: 1 day
- Security headers + CORS config: 0.5 day
- JWT_SECRET startup check: 0.5 day
- SSE escaping verification: 0.5 day
