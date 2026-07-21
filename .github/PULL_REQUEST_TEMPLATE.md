## Summary

What does this change do, and why? (~1-3 sentences)

## Related issue

Related to #...

Use `Closes #...` only when this pull request completes the linked issue.

## Test plan

**Verified commit:** `<full commit SHA>`

State the observable result, then record only the checks that prove it. Every result must come from the verified commit.

| Layer               | Command or observation                      | Result / evidence       |
| ------------------- | ------------------------------------------- | ----------------------- |
| Behaviour           | `pnpm exec vitest run ...`                  | Pass — ...              |
| Static              | `pnpm run ...`                              | Pass — ...              |
| Rendered / measured | Describe the inspected state or measurement | Link or attach evidence |

Delete unused rows. Attach screenshots, recordings, console output, measurements, or reproduction steps when the claimed outcome requires them.

## Checklist

- [ ] Any removed, hidden, or demoted capability is explicitly identified and approved
- [ ] Any required data migration, configuration change, or operator action is documented
- [ ] User-visible changes include rendered evidence for the affected states
- [ ] Verification evidence was produced from the exact commit recorded above
