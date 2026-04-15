# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Resilience Companion, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **adhorn@resiliumlabs.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if you have one)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix or mitigation**: Depends on severity, but we aim for:
  - Critical: 72 hours
  - High: 1 week
  - Medium/Low: Next release

## Scope

This policy covers the Resilience Companion application code in this repository. It does not cover:
- Third-party dependencies (report those to the upstream project)
- Infrastructure you deploy yourself

## Security Architecture

Resilience Companion is designed for self-hosted deployment. Key security considerations:

- **Authentication**: Three-tier middleware chain — (1) trusted proxy headers (`X-Forwarded-Email`) when `TRUST_PROXY_AUTH=true`, (2) PAT tokens (`Authorization: Bearer rc_...`) with bcrypt-hashed storage, (3) stub fallback (first DB user) for development. Production deployments should use proxy auth or PATs.
- **LLM integration**: API keys are server-side only. The agent has tool-level guardrails (sensitive file detection, credential redaction, content size limits).
- **No telemetry**: The application does not phone home or collect usage data.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| Older   | No        |

We recommend always running the latest version.
