---
name: pr
description: Create a pull request on GitHub. Use this when the user asks to open, create, or submit a PR.
allowed-tools: Bash(git *), Bash(gh *)
---

# Create Pull Request

When the user asks to create a pull request, follow this process.

## Process

1. **Understand the current state.**
   - Run `git status` to check for uncommitted changes. If there are any, ask the user if they want to commit first (suggest using `/commit`).
   - Run `git branch --show-current` to get the current branch name.
   - Run `git log --oneline main..HEAD` (or the appropriate base branch) to see all commits that will be in the PR.
   - Run `git diff main...HEAD --stat` to see a summary of all file changes.

2. **Ensure the branch is pushed.**
   - Check if the branch tracks a remote: `git rev-parse --abbrev-ref --symbolic-full-name @{u}`
   - If not tracking or behind, push with: `git push -u origin <branch-name>`

3. **Analyze all commits and changes.**
   - Read through every commit message and the full diff to understand what the PR does.
   - Do NOT just look at the latest commit — the PR includes ALL commits since diverging from the base branch.

4. **Draft the PR.**
   - **Title:** Short, imperative mood, under 70 chars. Summarize the overall change, not individual commits.
   - **Body:** Use the template below.

5. **Create the PR.**

   ```bash
   gh pr create --title "title" --body "$(cat <<'EOF'
   <body content>
   EOF
   )"
   ```

6. **Return the PR URL** to the user.

## PR Body Template

```markdown
## Summary

<1-3 bullet points explaining WHAT changed and WHY>

## Changes

<Bulleted list of notable changes, grouped logically>

## Test Plan

- [ ] <How to verify this works — manual steps, commands, or automated tests>
```

## Rules

- **Never** force push to create a clean history — the PR should reflect the actual work done.
- **Never** push to `main` or `master` directly. PRs should always be from a feature branch.
- If the user is already on `main`, ask them to create a feature branch first.
- If the base branch is ambiguous, ask the user which branch to target.
- Keep the title concise — use the description body for details.
- Mention breaking changes prominently if any exist.
- If the PR fixes a GitHub issue, include `Closes #<number>` in the body.
