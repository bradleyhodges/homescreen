# Home controls implementation plan

## Design

Build an Apple Home-inspired control system using the supplied screenshot as visual reference, not instructions. Keep the user's existing main-branch/no-questions workflow. Use warm system typography, a violet-to-coral wallpaper, translucent navigation, white active accessories, coloured circular symbols, generous touch targets and focused accessory sheets. Motion is subtle and respects reduced-motion preferences. Mobile uses compact room navigation and bottom sheets; desktop uses a sidebar and centred accessory dialogs.

## Boundaries

- Device models in `packages/home-assistant/src`: advertised capabilities determine controls and validated service payloads; no guessed control for unknown integrations. Cover standard actuator/helper domains; provide read-only state/attribute presentation for every other domain. Dangerous actions require explicit confirmation. PINs remain transient.
- Reusable presentational components in `packages/components/home`: device tile, detail sheet, capability controls and SF Symbols. Commands are injected callbacks, so the same components serve live and sample data without knowing a connection.
- Live application in `apps/web/components/home`: use narrow entity subscriptions and registry metadata for rooms; reflect authoritative state, pending actions, failures, reconnect and unavailable entities. No real device is actuated during automated validation.
- `/preview`: an explicit sample home with isolated local fixtures and simulated actions. Never mix example entities with live data. The connected screen links to this component showcase; empty installations get a useful onboarding state.

## Reviewable sections

- [x] Capability models and validated commands, regression tests; optional registry metadata with cleanup/failure isolation.
- [x] Reusable touch controls and accessory sheets: keyboard/focus support, range commit semantics, confirmations, safe error/pending states.
- [x] Connected home screen and explicit sample home, responsive layout and component documentation.
- [x] Focused tests, workspace typechecks, production build, browser verification of desktop/mobile interactions and final review; commit completed sections.

## Acceptance

All core controllable Home Assistant domain families have capability-aware panels. Read-only and unsupported entities are still inspectable with a clear explanation. Light brightness/colour, temperature, cover/valve position, fan speed, media controls, locks/security, cleaning devices, helper inputs and one-shot actions use documented service names and supported features. Sliders send only on commit, not every pointer movement. No optimistic false success, automatic retry of commands, fake live metrics or credential-bearing image URLs. Example-home actions never call Home Assistant.

Document domain coverage and boundaries, including integration-specific capabilities that need extension. Verify what can be tested without a logged-in live browser session; never claim device actuation was verified when it was simulated.
