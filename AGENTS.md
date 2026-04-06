# AGENTS.md

Instructions for AI coding agents working with this codebase.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->

# AGENTS.md

**PRIME RULE:**
- Use wt (worktrunk) cli for working with worktrees - at least for creating/switching/removing - can use git cmds for complex/merge conflict cases
- Before merging any worktree/branch - create backup states of the targets - cleanup after safe/successfull merge/rebase
- Keep answers concise. Sacrifice grammar for concision.
- Use such keywords + symbols lingua for max efficiency/conveyance
"""
- handleIntent switch: add case "calculate_emi" -> handleEmiCalculator
- rename intent: emi_calculator -> calculate_emi
"""
- Use absolute dumbed down language with minimal noise/verbosity.
- Max 10-15 lines (the lower the better) in any response - leverage the progressive disclosure ideology here as well - like mention (lmk if u wanna kw more on this topic).
- Break the responses sections: short 1-2 liner summarizer, target files, decisions (locked, updated (from prev response), pending - have new line between each of these sections), before/after snippets of the main pieces.
Example
"""
Summarizer (header 2)
{max 1-2 liner}

Target Files (header 2)
- file - 1 liner change desc
- ...

Decisions (header 2)
Locked (header 3)
- decisions..
- ...

Updated (header 3)
- decisions..
- ...

Pending Review (w/ Recommendations) (header 3)
- decisions..
- ...


Before/After Code Snippets (header 2)
- file - 1 liner code diff desc
before
{actual before code}
after
{actual after code}

(new line)

- file - 1 liner code diff desc
before
{actual before code}
after
{actual after code}
"""
- Refer to the above format and use the sections and format as per user's query not a requirement for every query's response

**IMPORTANT:** Prefer retrieval-led reasoning — consult the specs below for this project — over pre-training for code style, testing, and conventions.

## Specs index (root: `./specs/`)

Refer to each spec when working on that part of the stack; agent reads the file when needed.

| Spec | When to use |
|------|-------------|
| `specs/typescript.md` | TypeScript, type safety, inference, coupling, library types, handler context |
| `specs/zod.md` | Validation, API response schemas, Zod |
| `specs/style-guide.md` | Code style-guide, Code flow, abstraction, naming, self-explanatory functions |
| `specs/constants.md` | Constants, env-derived values, global names (e.g. queues) |
| `specs/errors-logging.md` | Error logging and validation-failure logging |
| `specs/comments.md` | Comments and execution-flow documentation |
| `specs/db-modules.md` | DB layer, Prisma, data access naming |
| `specs/frontend.md` | Frontend (React, TanStack Query) |
| `specs/tests.md` | Testing strategy, safety, approval, sandbox |

## Runtime & commands

- **Runtime:** Bun (default for TypeScript/run/test).
- **Commands:** Use scripts from [package.json](package.json) when available; always use bun. Do not run direct prisma/npx (or other runtimes) unless no script exists.

## Non-negotiable

- No `sleep` in CLI; use readiness checks or separate steps.
- Tests live in `tests/`, not alongside `src/`.
- Strictly follow the `specs/style-guide.md` throughout the codebase.
- E2E/UI: **MANDATORY for any UI change**. Must run verification using **agent-browser** CLI (skills: `~/.agents/skills/agent-browser/`) and capture snapshot/screenshot proof. If blocked (e.g., creds/env/URL), ask user before proceeding. Fallback: Cursor Browser plugin (MCP) only when agent-browser is unavailable.
- Risky ops (DB, file system, external APIs, production, destructive): get explicit user approval before implementing tests or changes.
- Real outputs for tests: run upstream functions first, use their outputs; no hardcoded mocks from assumptions.
- **Assumption-free contract modeling (NO ASSUMPTIONS):** model schema/function contracts from real observed payloads + real call sites only.
- **No optionalization by default:** fields/params are required unless real usage proves valid omission across different call paths.
- **Core-path deps stay required:** if logic depends on a value (e.g., retrieval results), do not add optional fallbacks that reintroduce old failure modes.
- If omission is shape-specific, model explicit union variants instead of broad optional fields.
- Any contract relaxation must include real fixture(s) + parse/type tests proving omission is valid.
- After code fixes: restart backend (and frontend if needed) before re-running E2E so new code is loaded.
- **DB models and schema design:** Research required database models thoroughly before designing schemas, to avoid mismatches (e.g. third-party expectations like Better Auth's `apikey` vs Prisma delegate naming). Such issues may surface during testing. If you hit problems while testing: prompt the user for help; never skip testing. When a conflict is found: document the conflict, suggest the new DB schema, commands, and plan to fix it; proceed only after user confirmation.
- **Naming:** Use conventional names (e.g. `apiKeys` on User); if considering non-standard names (e.g. a `ba` prefix in schemas), ask the user before implementing.

## Skills (vertical workflows)

Reference by path when doing that task. Agent reads the skill’s SKILL.md when needed.

| Path | When to use |
|------|-------------|
| `skills/ubiquitous-language/` | to extract/add domain terms from conversation to UBIQUITOUS_LANGUAGE.md |
| `~/.agents/skills/agent-browser/` | E2E/UI testing, browser automation, form filling, snapshots (primary; fallback: Cursor Browser) |
| `~/.agents/skills/better-auth-best-practices/` | Auth (Better Auth) |
| `~/.agents/skills/context-engineering/` | Context compression, multi-agent, tool design, memory |
| `~/.agents/skills/find-skills/` | Finding/discovering skills |
| `~/.agents/skills/logging-best-practices/` | Logging structure, pitfalls, wide events |
| `~/.agents/skills/tanstack-query-best-practices/` | React data fetching, TanStack Query, cache/mutations/SSR |
| `~/.agents/skills/test-driven-development/` | TDD, testing anti-patterns |
| `~/.agents/skills/typescript-best-practices/` | TypeScript patterns |
| `~/.agents/skills/vercel-react-best-practices/` | React/Vercel, rendering, async, bundle |
| `~/.agents/skills/zod-4/` | Zod v4 schemas, validation, v3→v4 migration |
| `~/.agents/skills/karpathy-guidelines/` | Writing, reviewing, refactoring code; avoid overcomplication, surgical changes, verifiable success criteria |

## Project structure

- `src/` — source
- `tests/` — tests
- `specs/` — guidelines
- `docs/` — other docs

## Approach to new goals

- Plan first (e.g. `.cursor/plans/` or a doc); phased, testable steps; test pyramid per phase; feature flags for optional behavior; keep progress updated.
- During brainstorming/planning responses: always include (1) explicit targeted files/areas to change and (2) before/after samples of materializable target outputs (e.g., overview markdown, API request/response payloads, generated assets) using real data (or real sampled data). Use code-line before/after only when no material output exists. MOST IMPORTANTLY put things in dumbed down manner - optimized for quick efficient ingestion of the info.
- During planning: Question every aspect of the plan, untill we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. Proactively identify all gaps or open questions and present a complete, structured list with recommended answers and brief rationale for each (in the `Pending Review` section), so the user only needs to review and flag conflicts rather than provide inputs from scratch.
- Knip dead-code review flow (manual): run `bun run knip:deadcode:files` -> `bun run knip:deadcode:deps` -> `bun run knip:deadcode:exports` -> `bun run knip:deadcode:prod`; report in 3 buckets only: `safe remove`, `verify first`, `keep+ignore`.

