# Home Assistant boilerplate implementation plan

## Goal and design

Modernise the cloned starter on main, in reviewable commits, without building a dashboard. The user's explicit authorisation replaces interactive design approvals and worktree setup.

Use `apps/web` for the Next.js App Router application. Use `packages/components` (`@repo/components`) for shadcn source, general hooks and utilities; `packages/home-assistant` for a browser-only OAuth/WebSocket client and selector hooks; and shared `packages/next-config` and `packages/typescript-config`. Real package exports resolve imports. Next.js compiles source packages directly; tsup adds no value until a separately published library is needed. Turbo coordinates builds and checks. No server stores credentials or proxies arbitrary Home Assistant URLs.

## Sections

- [x] Workspace and App Router: move shared configuration into packages, replace Pages Router entry points with server layout/page and client provider boundary, add strict TypeScript, Turbo scripts and reproducible dependencies. Remove obsolete Babel/styled-components setup and copied organisation-specific config. Validate package resolution, typecheck and production build; commit.
- [x] Tailwind and components: install latest stable Tailwind/PostCSS and shadcn CLI; generate small official component set under packages/components/ui with matching components.json aliases and CSS source detection. Move useful general hooks into the shared package. Validate CLI resolution, lint, typecheck and production CSS; commit.
- [x] Home Assistant: implement browser OAuth token storage scoped to this app, cancellation-safe connection ownership, SDK subscriptions and automatic reconnect, narrow entity selectors and guarded service calls. Replace unsafe legacy providers, discovery dependency and unfinished history hook. Test auth errors, token validation, late connection cleanup, reconnect, subscription cleanup and selectors. Wire minimal connection form/status and callback route; commit.
- [x] Public template: replace README and AGENTS.md, add environment example, CI and contribution/security guidance. Remove unlicensed copied font assets from the working tree and keep system fonts. Run full checks, production build, browser smoke test and independent final review; commit.

## Validation contract

`pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` must work from the root. Browser checks cover anonymous landing, connection form validation, callback failure and layout at mobile/desktop widths. Mock SDK tests are isolated test fixtures, never production fallback data. Live connector health is a separate read-only check and does not prove browser OAuth completion. No real devices are actuated in validation.

## Decisions

Explicit instance URL replaces mandatory server-side multicast discovery: this works in hosted deployments and avoids exposing LAN discovery through an unauthenticated API. Preserve entity/domain/search helper intent with narrow selectors. Credentials remain per-browser, with storage trade-offs documented; no NEXT_PUBLIC token. Avoid unused queues, polling libraries, analytics or workers. Preserve upstream attribution and do not invent a license for inherited code whose license cannot be verified.
