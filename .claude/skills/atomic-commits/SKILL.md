---
name: commit
description: Commit changes using atomic commit best practices. Use this whenever the user asks to commit, save, or checkpoint their work.
allowed-tools: Bash(git *)
---

# Atomic Commits

When the user asks to commit changes, follow these rules to produce clean, atomic commits.

## Principles

1. **One logical change per commit.** Each commit should do exactly one thing — a bug fix, a new feature, a refactor, a dependency update, a config change, etc. Never bundle unrelated changes.
2. **The codebase must build after every commit.** Never leave the repo in a broken state between commits.
3. **Split when in doubt.** If you can describe a commit with "X and Y", it should probably be two commits.

## Process

1. Run `git status` and `git diff` (staged + unstaged) to see all changes.
2. Analyze the changes and **group them by logical concern**. Common groupings:
   - Dependency additions/updates (package.json + lockfile)
   - Config file changes (drizzle.config.ts, next.config.ts, tsconfig.json, etc.)
   - New feature files (route, component, lib module — all files for one feature together)
   - Schema/migration changes
   - Bug fixes (the fix + any related test changes)
   - Documentation updates (README, CLAUDE.md, etc.)
   - Styling/UI changes
3. For each logical group, stage only those files and create a separate commit.
4. Check `git log --oneline -5` for the repo's existing commit style and match it.

## Commit Message Format

```
<short summary in imperative mood, max ~72 chars>

<optional body: explain WHY, not WHAT — the diff shows what changed>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

- Use imperative mood: "Add feature" not "Added feature" or "Adds feature"
- First line should complete the sentence: "If applied, this commit will \_\_\_"
- Categorize accurately: "Add" = new, "Update" = enhance existing, "Fix" = bug fix, "Remove" = delete, "Refactor" = restructure without behavior change
- Body is optional for self-explanatory changes, but include it for anything non-obvious
- Always include Co-Authored-By trailer

## Rules

- **Never** use `git add -A` or `git add .` — always stage specific files by name
- **Never** commit `.env.local` or files containing secrets
- **Never** amend a previous commit unless the user explicitly asks
- **Never** force push
- If a pre-commit hook fails, fix the issue and create a **new** commit (don't amend)
- After all commits are done, run `git log --oneline -10` to show the user what was created

## Example

If `git status` shows changes to `package.json`, `pnpm-lock.yaml`, `src/lib/r2.ts`, `src/app/page.tsx`, and `README.md`, and the changes are:

- Added a new dependency
- Updated the R2 helper with a new function
- Fixed a typo in the README

That's **three** commits:

1. `Add <package> dependency` (package.json + pnpm-lock.yaml)
2. `Add <function> helper to R2 module` (src/lib/r2.ts)
3. `Fix typo in README` (README.md)
