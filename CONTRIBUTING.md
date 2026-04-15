# Contributing to Resilience Companion

Thanks for your interest. Before you open an issue or PR, please read this page in full — it will save both of us time.

## What this project is

The Resilience Companion is a working argument for a set of ideas from the book *[Why We Still Suck at Resilience](https://leanpub.com/whywestillsuckatresilience)*. It is **not** a generic resilience platform looking for feature requests. Every design decision is downstream of a claim in the book:

- Reviews are conversations, not checklists
- Productive struggle is the point, not an obstacle to smooth UX
- Learning is measured, checklists are counted — only one of these matters
- Document-first, with conversations as ephemeral scaffolding

If a proposed change conflicts with those claims, it probably won't land — not because your idea is bad, but because this isn't the right home for it.

## Maintainer reality check

- **Maintained by one person**, in spare time, alongside writing the book.
- **No SLA** on issues or PRs. Expect days-to-weeks response times.
- **Active architectural flux.** Core structures (agent loop, retrieval, memory) are still moving. Coordinate before building anything non-trivial.
- **Opinionated scope.** Features that don't serve the book's argument are out of scope, even if they'd be useful in other contexts.

If any of that is a dealbreaker, fork it. That's a legitimate outcome — the AGPL-3.0 license allows it.

## What I'm looking for

In rough priority order:

1. **Bug reports with reproductions.** Clear steps, expected vs actual, environment details. These get the fastest attention.
2. **Security issues** — see the Security section below. Do not open public issues for these.
3. **Documentation fixes.** Typos, broken links, out-of-date commands, unclear explanations. Easy wins, gratefully received.
4. **Small, focused fixes** to existing features that clearly match the book's framing.
5. **Discussion issues** (prefix title with `[Discussion]`) for larger ideas — before writing any code.

## What I'm *not* looking for

- Large unsolicited refactors. Even if the code would be better, a surprise 2000-line PR is almost always rejected. Open a discussion issue first.
- New practices, agent profiles, or integrations without a book-grounded justification.
- Backwards-compatibility shims for early-adopter deployments. The project is pre-1.0 and breaking changes are expected.
- Enterprise features: RBAC beyond the existing team model, multi-tenancy, billing, SAML for fun, compliance dashboards. Not in scope.
- "I ran a linter and here are 47 cosmetic fixes" PRs.
- AI-generated PRs without evidence that you read the code and tested the result.

## Before you open a PR

1. **Open a discussion issue first** for anything non-trivial. "Non-trivial" = more than ~50 lines, touches the agent loop, adds a dependency, or changes a database schema. A quick "here's what I want to do, does this fit?" exchange saves everyone pain.
2. **Read the relevant book chapter.** If your change touches ORRs, read chapter 5. Incident analysis, chapter 9. Learning, chapters 2 and 11. The book is the spec.
3. **Run the existing checks**: `npm run lint`, `npm test`, `npm run build`. PRs that break these will bounce.
4. **Include tests** for new behavior. The existing test suite (`vitest`) is the expected pattern.
5. **Keep the diff focused.** One concern per PR. If you find yourself wanting to fix three unrelated things, open three PRs.
6. **Write the PR description as if I haven't read the issue.** What problem, what approach, what trade-offs, what you tested.

## Code style

- TypeScript strict mode. No `any` without a comment explaining why.
- Match the existing patterns in the file you're editing — this codebase is more consistent than a style guide could be.
- No new dependencies without justification in the PR description. Dependencies are liabilities.
- No comments explaining *what* the code does when the code already says it. Comments should explain *why*.

## Commits

- Write commit messages as if the reader doesn't have the PR description. Subject line is a sentence; body explains why.
- Group related changes into logical commits; don't squash everything into "fix stuff".
- Rebase onto main before requesting review.

## Security

Do not file public issues for security problems. Instead, email **adhorn@resiliumlabs.com** (see [SECURITY.md](SECURITY.md) for full policy). Include:

- What the issue is
- How to reproduce it
- What the impact is
- Any suggested fix

I'll acknowledge within a reasonable time and coordinate disclosure. I will credit you in the fix unless you prefer otherwise.

Reminder: this tool's threat model is "trusted internal network, single team." If your report is "I exposed it to the public internet and it's insecure," that's documented behavior, not a bug. See the README's threat model section.

## Licensing of contributions

By contributing, you agree that your contributions will be released under the [AGPL-3.0](LICENSE) license.

## Code of conduct

Be kind. Assume good faith. Argue ideas, not people. If you wouldn't say it to a colleague in a design review, don't say it here.

I reserve the right to close issues, reject PRs, and block users without a lengthy public explanation. This is a one-person project and my time is finite.

## Finally

If the above sounds grumpy, it's not meant to be — it's meant to be honest about what this project is and isn't, so people don't spend weeks on work that was never going to land. If in doubt, open a short discussion issue and ask. "Would you be open to X?" is always welcome.
