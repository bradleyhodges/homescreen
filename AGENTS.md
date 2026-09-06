# AGENTS.md

## Project layout

- `apps/web/app`: Next.js App Router pages, root layout, client provider boundary, auth callback and route error UI.
- `apps/web/components`: application-specific UI. Put future app-only utilities in `apps/web/lib` and hooks in `apps/web/hooks` when needed.
- `packages/components/ui`: current shadcn Base UI / Nova source. Reuse these components before adding new ones.
- `packages/components/home`: reusable capability-aware accessory tiles, modal sheets, touch inputs and SF Symbols. Command transport is injected.
- `apps/web/components/home`: live room dashboard, search, pagination, plus isolated sample fixtures and adapter used only by `/preview`.
- `packages/components/hooks`: reusable browser hooks; keep lifecycle cleanup and tests together.
- `packages/components/lib`: shared utilities.
- `packages/components/styles/globals.css`: Tailwind v4 theme and source detection.
- `packages/components/styles/home.css`: accessory surfaces, interaction sizing and reduced-motion-aware sheets.
- `packages/home-assistant/src`: browser authentication, connection ownership, entity streaming, selector hooks and tests.
- `packages/next-config`: shared Next.js configuration and bundle analyzer.
- `packages/typescript-config`: strict shared TypeScript configurations.
- `docs`: architecture/migration decisions.
- `.github/workflows`: CI checks.

There are no analytics, database, auth-server or worker packages. Do not invent infrastructure to match another project's layout.

## Documentation

Use Context7 MCP for current library/framework/SDK/API/CLI/cloud documentation before changing library-specific setup or behavior. Start with resolve-library-id, select the relevant official/high-quality match, then query-docs using the full question. Skip resolution only when the user provides the exact library ID. General business logic, refactoring and code review do not require documentation queries.

## Workspace and commands

Use Node.js 24 and the pnpm version pinned in root package.json. Run commands from the repository root:

- `pnpm install --frozen-lockfile`: reproduce dependencies.
- `pnpm dev`: start the app through Turbo.
- `pnpm format`: project Tailwind/Prettier formatting script; `pnpm format:biome` applies Biome formatting/lint fixes.
- `pnpm format:check`: verify Biome formatting.
- `pnpm lint`: Biome formatting and lint checks.
- `pnpm typecheck`: all workspace TypeScript checks and Next route type generation.
- `pnpm test`: Vitest regression tests.
- `pnpm check`: format, lint, typecheck and tests.
- `pnpm build`: production Next build.
- `pnpm start`: serve the production build.
- `pnpm ui:add <component>`: use installed shadcn CLI in the shared components package.

Use pnpm-workspace.yaml and real package exports. App-local aliases use `@/...`. Shared imports use paths such as `@repo/components/ui/button` and `@repo/home-assistant/hooks`. Avoid broad root aliases or barrels that blur server/client boundaries.

Shared packages export source. Next transpiles them; do not add tsup or duplicate package watchers without a separate distribution requirement. Keep Turbo inputs/environment/output declarations correct when adding tasks or public build-time values.

## Engineering rules

- Inspect existing code and preserve conventions. Keep changes coherent, complete, strongly typed and minimal.
- Verify schema, API and SDK assumptions against code, types, current documentation or tests.
- Do not add production dependencies without justification. The lint toolchain's TypeScript/ESLint compatibility pins are documented in README; upgrade the compatible graph together.
- Use existing UI components, semantic tokens, accessible labels and visible focus states. Include meaningful loading, error, disabled and empty states.
- Prefer `@bradleyhodges/sfsymbols` rendered with `@bradleyhodges/sfsymbols-react`. Use Tabler only when no suitable SF Symbol exists; do not add Lucide. shadcn's generator fallback is Tabler; review generated icons. Follow the upstream icon license terms for intended distribution.
- Use Server Components by default. Add `"use client"` to browser hooks/providers and interactive entry points.
- Review shadcn output and dependency changes; the registry can introduce imports requiring explicit dependencies. Keep components.json aliases and Tailwind source paths correct.
- No placeholders, production mocks, debug logging, swallowed failures or unfinished hooks.
- Add JSDoc to exported utilities and explain non-obvious ownership/concurrency decisions.
- Add or update tests for lifecycle, security, permissions, transformations and failure behavior. Do not merely mirror implementation.
- Run relevant checks before claiming completion. Report exact failures or unavailable validation honestly.
- If persistence/schema is introduced, include the corresponding migration.

## Home Assistant boundaries

- Keep one provider per app and one owned connection per provider. Home Assistant data stays in the browser.
- Do not log tokens, put credentials in NEXT_PUBLIC variables, persist the full connection/store or clear unrelated browser storage.
- Validate callback state before the SDK can consume query parameters on any route. Scope tokens to this application, instance and browser client.
- Test StrictMode, stale async work, logout during reconnect, socket handshake timeout, entity removals across reconnect and subscription rejection.
- Preserve the SDK's reconnect policy. Never automatically retry service calls: a lost result does not prove the action failed.
- Prefer narrow entity selectors; do not subscribe whole dashboards to all changing entities.
- Keep `/preview` outside the live provider. Sample fixtures never enter the live store or invoke real services.
- Build commands from current capabilities, require consequential-action confirmation, keep PINs transient, and commit slider changes only on release/keyboard commit. Never fabricate success state from a service acknowledgement.
- Registry failures must not break the entity stream. Room lookup honors entity overrides, inherited device areas and hidden/disabled entries.
- Never use real device actions for test assertions without explicit user authorization.
- Client checks are not backend authorization. Any future server routes must enforce their own auth and ownership.

## Git discipline

After each major coherent change, create a Conventional Commit:

```text
feat(app): add connection setup
fix(home-assistant): close stale sockets after logout
refactor(components): consolidate shared hooks
chore(repo): update workspace tooling
```

Use the affected app/package/subsystem as scope. Keep temporary files, unrelated changes and failed experiments out of commits. Inspect staged changes and run applicable validation. Do not leave completed major work uncommitted. Push, deployment and public release require user authorization.

Before public redistribution, resolve the inherited license status documented in README; do not invent rights to copied code/assets or rewrite history unasked.
