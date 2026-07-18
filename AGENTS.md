# Scope

- Complete only the explicitly requested task.
- Do not provide alternatives/explanations unless requested.
- If required information is missing, ask one question and stop.
- Do not infer missing requirements, project structure, architecture, or intent.
- If a required change falls outside scope, stop and report it.

# Operating workflow

- Keep dependent implementation slices on one draft pull request. Split work only when it is independently reviewable and revertible.
- Before editing, verify the active branch, worktree, and ownership of any existing changes.
- Put verification evidence and reviewer-facing explanations directly on the pull request.
- Own the complete repair loop: implement, verify, request independent review, repair findings, re-review the exact head, then merge when authorised.
- Do not wait for the user to relay reviewer returns or ask for an already-authorised merge.
- Define the observable success condition and its verification layer before implementation. Static gates do not prove runtime, browser, visual, interaction, or performance outcomes.
- Do not use a closing keyword for an epic unless the pull request completes the entire epic.

# Committing / Opening a Pull Request

Follow the [Contribution Guide](./CONTRIBUTING.md)

# Coding

- Start simple and defer complexity. Earn it through measurement.
- Prefer extending existing systems over introducing new ones.
- Minimise moving parts.
- Prefer deletion over addition.
- Keep logic local.
- Avoid speculative abstractions.
- Respect scope boundaries.
- Do not perform opportunistic refactors, renames, reorganisations, or cleanups unless explicitly requested.
- Work in small, verifiable steps.
- Commit after each complete, verified logical change; do not defer all commits until the end of a task.
- Prefer built-in platform, language, and framework capabilities over custom abstractions.
- Avoid abstraction unless it removes duplication.
- Avoid `useEffect` at all costs — see [Effects](./docs/rules/effects.md) rules

## Testing

- Follow the [above](#coding)
- Follow [Testing](./docs/rules/testing.md) rules
