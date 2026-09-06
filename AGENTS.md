# AGENTS.md

# Repository-Specific Instructions

## Project layout

- `app`: main web application.
- `packages/analytics`: analytics utilities.
- `packages/auth`: authentication utilities.
- `packages/design-system`: shared design system parts for the repository - components, hooks, utils, etc.
- `packages/next-config`: shared next.js configuration for all apps.
- `packages/typescript-config`: shared TypeScript configuration for the repository.
- `stores`: zustand store configurations
- `workers`: source code for Cloudflare workers which support the apps.
- `scripts`: development and deployment utility scripts for the repository.

## Commands

- Install dependencies with `pnpm install`.
- Run formatting with `pnpm format`.

## Repository-specific rules

- Use existing UI components before creating new ones. Avoid using the packages/design-system/components/ui/legacy components - we are moving away from the legacy components. All others are acceptable.
- Do not add production dependencies without justification.
- Do not modify database schema without adding or updating the corresponding migration.
- Commit each major coherent change using Conventional Commits in accordance with the below instructions.

## Repository Contribution Instructions

These instructions apply to all automated coding agents working in this repository, including Codex and similar agentic development tools.

## Git Commit Expectations

After each major change, the agent must commit the completed changes to the GitHub repository.

A “major change” includes, but is not limited to:

- Adding, removing, or materially changing application functionality.
- Refactoring a meaningful area of the codebase.
- Updating configuration, build tooling, deployment logic, or package structure.
- Adding or materially changing tests.
- Implementing a requested feature, fix, or task milestone.

Minor exploratory edits, temporary debugging changes, or work-in-progress changes do not need to be committed until they form part of a coherent completed change.

## Commit Message Format

All commits must use the Conventional Commits format:

```text
<type>(<scope>): <brief description>
```

Examples:

```text
feat(app): add user invitation flow
fix(packages/design-system): tidy up broken component
refactor(app): simplify role permission checks
chore(repo): update dependency lockfile
docs(repo): update local development instructions
```

## Scoping Rules

Where a change only affects a particular app, package, service, or logical area, the commit message must include an appropriate scope.

For example:

```text
feat(app): add dashboard activity feed
fix(packages/design-system): prevent modal focus trap regression
chore(infra): update docker compose healthchecks
```

If a change is repository-wide and no narrower scope is appropriate, use a broad scope such as:

```text
chore(repo): update workspace configuration
refactor(repo): standardise linting rules
```

## Commit Hygiene

Before committing, the agent should make reasonable efforts to ensure that:

- The change is complete and coherent.
- Formatting has been applied where applicable.
- Relevant tests, type checks, or lint checks have been run where practical.
- Temporary files, debug statements, and unrelated edits are not included.
- The commit contains only the files relevant to the completed change.

## Agent Behaviour

Agents should treat committing as part of the normal completion process for substantial repository changes.

Unless explicitly instructed otherwise, agents should not leave completed major changes uncommitted.