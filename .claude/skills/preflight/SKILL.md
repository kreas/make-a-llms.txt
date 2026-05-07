---
name: preflight
description: Run build, tests, and lint to confirm code is clean before committing. Use before /commit or when you want a confidence check.
allowed-tools: Bash(pnpm *)
---

# Preflight

Pre-commit confidence check. Run build, tests, and lint in sequence — stop on first failure.

## Command

```bash
pnpm build && pnpm test:run && pnpm lint
```

## On failure

- Report which step failed (build, test, or lint) and the error output
- Do NOT auto-fix. Show the issue and ask for direction.

## On success

- Report all three passed with a one-line summary
- Ready for `/commit`
