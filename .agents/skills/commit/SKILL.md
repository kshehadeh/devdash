---
name: commit
description: Stage and commit changes using atomic conventional commits. Use when the user asks to commit, save, or checkpoint work.
disable-model-invocation: true
---

# Commit Skill

## Overview

Commit staged and unstaged changes as one or more atomic conventional commits. Each commit must map to a single logical unit of work (feature, fix, refactor, etc.). Before committing, lint and build must pass — fix any failures first.

## Steps

### 1. Understand What Changed

Run these in parallel to get a full picture:
- `git status`
- `git diff` (unstaged)
- `git diff --cached` (staged)

Never proceed without reading the full diff.

### 2. Verify Quality Gates

Run the following and fix any failures before committing:

```bash
bun run lint
bun run electron:compile
bun run build
```

- If `lint` fails: fix all lint errors. Do not use `--no-verify` or suppress rules.
- If `electron:compile` fails: fix TypeScript errors in `electron/`.
- If `build` fails: fix the Vite build errors in `src/`.
- Re-run the failing command after fixes and confirm it passes before continuing.

### 3. Plan Atomic Commits

Group the changes into the smallest meaningful commits. Each commit should:
- Represent **one** logical change (a feature, a bug fix, a refactor, a chore, etc.)
- Be independently reviewable and revertable
- Not mix unrelated concerns (e.g., don't bundle a bug fix with a new feature)

Common groupings to consider:
- New feature additions together
- Bug fixes together (or separately if unrelated)
- Dependency/config changes separate from app logic
- Refactors separate from behavior changes
- Test-only changes separate from implementation

If all changes clearly belong to one unit of work, a single commit is fine.

### 4. Write Conventional Commit Messages

Each commit message must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<optional scope>): <short description>
```

**Types:**
- `feat` – a new feature
- `fix` – a bug fix
- `refactor` – code change that neither fixes a bug nor adds a feature
- `chore` – tooling, config, dependency updates, cleanup
- `style` – formatting, whitespace (no logic change)
- `test` – adding or updating tests
- `docs` – documentation only
- `perf` – performance improvement
- `ci` – CI/CD pipeline changes
- `build` – changes to build system or external dependencies
- `revert` – reverts a previous commit

**Scope** is optional but encouraged (e.g., `feat(notifications):`, `fix(cache):`, `chore(deps):`).

**Rules:**
- Use imperative mood: "add support for X" not "added support for X"
- Keep the subject line under 72 characters
- No period at the end of the subject
- If a commit needs more context, add a blank line then a body paragraph

**Examples:**
```
feat(settings): add development settings section with devtools toggle
fix(cache): include github_pr_review_comments in cache bucket defs
refactor(sidebar): remove reference tab and related routes
chore: update tsconfig paths for new skill directory
```

### 5. Stage and Commit

For each planned commit:

1. Stage only the files for that commit using `git add <files>` (avoid blanket `git add .` when doing multiple atomic commits)
2. Run `git commit -m "<message>"` with the conventional commit message
3. Confirm the commit was created with `git log --oneline -3`

Include co-authorship on every commit:
```
git commit -m "<subject>

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

### 6. Verify

After all commits:
- Run `git log --oneline -<n>` where `<n>` is the number of commits made
- Confirm commit messages are correct, no unintended files were included, and no sensitive data (API keys, tokens, credentials) is present in any diff

## Constraints

- Never use `--no-verify` to bypass hooks
- Never commit secrets, credentials, `.env` files, or private keys
- Never stage files listed in `.gitignore`
- Never push unless the user explicitly asks
- Do not create empty commits
- If the quality gates cannot be fixed, stop and report the blocker to the user rather than committing broken code
