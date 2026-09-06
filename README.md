# Homescreen

A Next.js App Router starting point for building a Home Assistant interface, with an Apple Home-inspired room dashboard and reusable, touch-friendly accessory controls. Explore `/preview` without connecting a real home. See [the control guide](docs/home-controls.md) for coverage, extension points and interaction behavior.

## Quick start

Use Node.js 24 and pnpm 11.6.0 (pinned in `package.json`).

```sh
npm install --global pnpm@11.6.0
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://localhost:3000), enter your Home Assistant origin, and sign in on Home Assistant. Use the same browser tab through the redirect back to `/auth`. No access token or instance address needs to be committed.

Optionally copy `apps/web/.env.example` to `apps/web/.env.local` and set `NEXT_PUBLIC_HOME_ASSISTANT_URL` to prefill the form. It is a public build-time value, not a secret. Rebuild after changing it in production.

## Layout

```text
apps/web/
  app/                 App Router layout, pages, callback and error boundary
  components/          Connection screen, live room dashboard and isolated sample home
packages/
  components/
    ui/                Generated shadcn components (Base UI / Nova)
    home/              Capability-aware accessory tiles, sheets, inputs and SF Symbols
    hooks/             Clipboard, file selection and mobile breakpoint hooks
    lib/               Shared class-name and string utilities
    styles/            Tailwind v4 entry point and theme tokens
  home-assistant/
    src/               Browser connection lifecycle, auth, entity state and hooks
  next-config/         Shared Next.js defaults and opt-in bundle analyzer
  typescript-config/   Strict base, React and Next.js compiler configuration
docs/                  Migration design and decisions
```

App-local modules use `@/...`. Shared modules use real workspace package exports:

```tsx
import { Button } from "@repo/components/ui/button";
import { cn } from "@repo/components/lib/utils";
import { useCopyToClipboard } from "@repo/components/hooks/use-copy-to-clipboard";
import { useEntity, useHass } from "@repo/home-assistant/hooks";
```

Shared packages export TypeScript source, compiled by Next's `transpilePackages`. Turbo coordinates typechecks and caches Next build output. No tsup stage or separate library watcher is necessary. Introduce a package build only if consumers outside this workspace need published JavaScript.

## Home Assistant usage

`apps/web/app/providers.tsx` mounts one `HassProvider` above live routes. The isolated `/preview` route does not mount it. Components using its hooks must be Client Components.

| Hook                      | Returns                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `useEntity(id)`           | One entity, or `undefined`; unrelated entity updates do not rerender it |
| `useEntityIds()`          | Entity membership without rerenders for individual state changes       |
| `useRegistry()`           | Optional room, device and entity registry metadata and availability    |
| `useEntities(ids?)`       | All entities or the requested subset; missing IDs are omitted           |
| `useDomain(domain)`       | Entities in the exact domain, such as `light`                           |
| `useQuery(query)`         | Case-insensitive substring matches on ID or friendly name               |
| `useHass()` / `useAuth()` | Connection status, safe error, instance URL and stable actions          |

Connection actions are `connect(url)`, `retry()`, `disconnect()`, `logout()`, and `callService(domain, service, data?, target?)`. Connection errors appear in state. Service errors reject their promise and must be handled by the caller.

```tsx
"use client";

import { useState } from "react";
import { Button } from "@repo/components/ui/button";
import { useEntity, useHass } from "@repo/home-assistant/hooks";

export function LightToggle({ entityId }: { entityId: string }) {
  const entity = useEntity(entityId);
  const { status, callService } = useHass();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await callService("light", "toggle", undefined, { entity_id: entityId });
    } catch {
      setError(
        "Could not confirm the result. Check the light before retrying.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        disabled={
          pending ||
          status !== "connected" ||
          !entity ||
          entity.state === "unavailable"
        }
        onClick={() => void toggle()}
      >
        {entity?.attributes.friendly_name ?? entityId}:{" "}
        {entity?.state ?? "Not found"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
```

Use narrow hooks in entity cards; subscribing a dashboard root to every entity causes unnecessary rendering. Entity updates are pushed through one WebSocket, with no polling or additional query cache. Reconnect is automatic. Service actions are never automatically retried because a lost response does not mean a device ignored the command.

The client targets Home Assistant 2022.9+ and uses the optimized `subscribe_entities` protocol with message coalescing. A bounded socket handshake and managed entity subscription wrap the SDK's Auth and Connection APIs: they close cancelled handshakes, replace snapshots after reconnect and report subscription rejection. The SDK still owns reconnect timing and request correlation. See the tests beside the client for these protocol and authentication edge cases. No production mock state is included.

### Authentication and deployment

- OAuth tokens live under `homescreen.hass.*.v1` keys in tab-scoped session storage. Reloads can restore the session; closing the tab normally ends it. Browser session restoration may retain it.
- Browser-side tokens are accessible to scripts on the same origin. Keep that origin trusted, avoid untrusted third-party scripts, and use a dedicated Home Assistant user with appropriate permissions. Home Assistant enforces device authorization.
- `disconnect()` closes the connection but retains the stored session. `logout()` removes only this app's keys and attempts token revocation. Revocation failures are shown; remove the token from the Home Assistant profile if required.
- There is no Next.js backend authentication layer. Adding private server routes requires separate server-side authentication and authorization.
- The browser must reach Home Assistant over HTTP(S) and WS(S). An HTTPS deployment requires an HTTPS Home Assistant origin with a valid certificate. For a local HTTP instance, develop over local HTTP.
- Redirects return to the app origin's `/auth` route. Keep the root and callback under the same origin; subpath deployments are not configured.
- LAN multicast discovery was removed. It does not work reliably from hosted/serverless deployments and should not be exposed as a public discovery endpoint.

For a Node host, install at the repository root, run `pnpm build`, then `pnpm start`. On a Next.js hosting platform, select `apps/web` as the app root and enable access to workspace files outside that directory. Set any public URL before building. No Home Assistant credentials are needed on the hosting platform.

### Troubleshooting

If sign-in fails, check the origin (no path/query/credentials), browser reachability, HTTPS compatibility and whether session storage is allowed. Start again from the connection form after a cancelled or stale callback. Network and subscription failures appear in the screen; retry after resolving the cause.

Browser privacy restrictions on public sites accessing local networks may also require local-network permission. Configure HTTPS and reachability for your deployment rather than disabling browser protections.

## Components and styling

Tailwind 4.3.3 uses `@tailwindcss/postcss` and CSS-first configuration. `packages/components/styles/globals.css` owns theme tokens and explicitly scans app and package source. No Tailwind v3 config is needed. System fonts avoid a build-time font download and bundled proprietary fonts.

shadcn CLI 4.21.0 is installed as a development tool. Generated source lives in `packages/components/ui`.

```sh
pnpm ui:add button --dry-run
pnpm ui:add dialog
pnpm check
pnpm build
```

Review generated files before committing. The current registry uses the `cn` package directly; the shared `lib/utils` re-exports the same implementation. Base UI and class-variance-authority are explicit dependencies. Additional components may introduce dependencies; add only what the application needs. Keep both `components.json` files aligned. Do not add UI to the old root folders.

The migrated file-selection hook manages browser previews; it does not upload to a server. Its checks are UX validation, not a security boundary. `maxFiles` applies to multiple selection; single selection replaces one file. Any future upload endpoint must validate content and permissions independently.

## Development checks

```sh
pnpm format
pnpm check
pnpm build
```

`pnpm check` runs Biome format/lint verification, workspace typechecks and Vitest. Tests use mocked transport only inside tests and need no live credentials. The explicit sample route uses a separate local simulator. CI runs the same checks and a production build on Linux and Windows.

Next.js 16.3.4 and React 19.2.8 are pinned. TypeScript 6.0.3 and ESLint 9.39.5 are compatibility pins: the current Next lint plugin graph does not yet declare support for TypeScript 7 / ESLint 10. Revisit these together when the upstream plugins support them; ESLint 9 is now marked deprecated by its publisher. Avoid suppressing peer requirements to force an upgrade.

Optional bundle inspection uses the copied shared analyzer configuration:

```sh
# POSIX shell
ANALYZE=true pnpm --filter @repo/web exec next build --webpack
```

```powershell
$env:ANALYZE = "true"
pnpm --filter @repo/web exec next build --webpack
Remove-Item Env:ANALYZE
```

The normal development and production commands use Next.js's default Turbopack. Turbo and Turbopack have different jobs: workspace task scheduling versus application compilation.

## Migration notes

The Pages Router, styled-components/Babel setup, Zustand v3 global stores, mandatory multicast discovery, unfinished history hook and old query/provider barrels were removed. `useQuery` now uses predictable substring matching instead of Fuse. `useHass` exposes connection controls, not the entire entity/config/service store. Add explicit config/service subscriptions when a feature needs them.

Copied organisation-specific host allowlists, analytics assumptions and proprietary font files are not part of the new application. Font files still exist in prior Git history; deleting them from the current tree does not rewrite history.

## Attribution and release status

This repository began from [dangreco/home-assistant-nextjs-starter](https://github.com/dangreco/home-assistant-nextjs-starter). The inherited repository contains no license file, so this migration does not assert a license for that material. Before redistributing this as a licensed public template, confirm rights to inherited/copied material and choose a repository license. Check Git history as well as the current tree. Dependency licenses remain their authors' own.

API references: [Next.js App Router migration](https://nextjs.org/docs/app/guides/migrating/app-router-migration), [shadcn monorepos](https://ui.shadcn.com/docs/monorepo), [Home Assistant WebSocket client](https://github.com/home-assistant/home-assistant-js-websocket), and [Turborepo configuration](https://turborepo.com/docs/reference/configuration).
