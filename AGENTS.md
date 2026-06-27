# Scope

- Complete only the explicitly requested task.
- Do not provide alternatives/explanations unless requested.
- If required information is missing, ask one question and stop.
- Do not infer missing requirements, project structure, architecture, or intent.
- If a required change falls outside scope, stop and report it.

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
- Commit after each complete, verified logical change.
- Prefer built-in platform, language, and framework capabilities over custom abstractions.
- Avoid abstraction unless it removes duplication.

## Testing

- Follow the [above](#coding)
- Follow [Testing](./docs/rules/testing.md) rules
