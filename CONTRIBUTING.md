# Contributing

## Prerequisites

- pnpm 9.15.4
- Node.js 26.x
- A browser with WebGPU support

## Setup

```bash
pnpm install
pnpm dev
```

## Code conventions

Read [AGENTS.md](./AGENTS.md) — it documents every toolchain quirk and pattern this project enforces.

## Commit discipline

- **One logical change per commit** — feature, fix, refactor, docs, or chore
- **Never `git add -A`** — stage specific files only
- **Every commit** should be atomic, verifiable, reviewable, revertable.
- Commit after each complete, verified logical change; do not defer all commits until the end of a task.
- **Co-author required** — include the model/agent name if known (e.g. "Claude Sonnet 4")
- **Never combine `git add` and `git commit` in one command.** Always run them as separate commands.

### Commit message

```
type(scope): description

<OPTIONAL BODY>

Co-authored-by: Model Name <email@example.com>
```

- Generate message **only from `git diff`** — not from memory, chat, or assumptions
- Review the **full** `git diff` including all staged files. Do not anchor on a subset of changes when composing the message.
- Body optional — add it only when explaining _why_ (not _what_), non-obvious bugs, or trade-offs
  - Add a body when the summary does not completely capture the entire reason for the commit
- Co-author matches the actual model/agent from your session. Omit if unknown.
- If closing an issue, a body is required:

```
Closes #ISSUE_NUMBER
```

With the preceding hashtag.

### Diff summaries

When summarising changes, summarise the actual diff only.

Required process:

1. Use `git diff --cached` for staged changes.
2. Compare against the correct base, not the worktree or memory.
3. Do not infer capabilities from file names, class names, or architecture shape.
4. Treat moved/renamed/extracted code as refactor unless behaviour changed.
5. Distinguish clearly between:
   - added behaviour
   - removed behaviour
   - refactored existing behaviour
   - renamed/moved code
   - cleanup/dead-code removal
6. Do not claim something is “new”, “now supports”, or “enables” unless the diff proves it was impossible before.
7. Prefer boring accuracy over architectural narrative.
8. If unsure whether something already existed, say so instead of guessing.

Output format:

- Start with a one-sentence summary of the real delta.
- Then list concrete changes grouped by kind.
- Avoid future-roadmap language unless the diff directly adds future-facing API surface.

Before summarising, verify each claim against added/removed lines in the diff. Unsupported claims must be omitted.

### Never do

- `git add -A`
- Stage + commit in same command (`git add . && git commit`)
- Mix unrelated files in one commit
- Generate commit message from memory or chat — use `git diff` only
- Commit non-project/throwaway files (e.g. `GPT.md`, `.cursor/`, personal notes)

### Commit Flow

1. `git status` — check what changed
2. `git diff` / `git diff --staged` — review changes
3. `git add <specific-files>` — stage ONLY the files (never `-A`)
4. `git commit` — separate command from add

## Pull requests

1. Open an issue first (unless it's a trivial fix) to discuss the approach.
2. Keep PRs focused — one logical change per PR.
3. Fill out the [pull request template](./.github/PULL_REQUEST_TEMPLATE.md) completely.
4. Do not open a PR with a custom body that skips the template sections.
5. In `## Summary`, explain the change in terms of behaviour, intent, and why it matters — do not just restate the diff.

## Labelling issues

Never file an issue bare. Every issue gets **at least one type label**, plus a **grouping/area label where one fits**.

**Type labels** (what kind of work — pick ≥1):

- `bug` — something is broken (default for defects)
- `enhancement` — new feature or request (default for features / UX)
- `perf` — performance / efficiency
- `test-infra` — testing infrastructure / conventions
- `documentation` — documentation changes
- `structure` — file organisation / conventions
- `simplify` — reduce complexity without behaviour change
- `reuse` — consolidate duplication / reuse existing code
- `a11y` — accessibility
- `question` — a question, not actionable work yet

**Grouping / area labels** (add where applicable):

- `epic` — large multi-issue initiative
- `deferred` — backlog / not scheduled yet
- `observability` — logging, tracing, metrics, error reporting
- `a11y` — accessibility

Opening an issue through the [issue forms](./.github/ISSUE_TEMPLATE) applies the `bug` / `enhancement` type label automatically; add any further type or grouping labels by hand.

## Questions?

Open a [discussion](https://github.com/galaxiajs/shard/discussions) or an issue.
