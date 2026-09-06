# Home controls

The default connected screen groups real Home Assistant entities by room. Registry-hidden and disabled entities are omitted. Entities without a room appear under their device type. If the account cannot read registries, entity controls remain available. Search, room navigation and category filters help with larger installations.

Open `/preview` for an explicitly labelled sample home and the full control catalog. Its state is local to the page. It does not mount the Home Assistant provider, authenticate, connect, or send service calls. Reloading resets the examples.

## Reuse a control

Import the shared styles once in your root layout:

```tsx
import "@repo/components/globals.css";
import "@repo/components/home.css";
```

A connected accessory needs only its entity and a command transport:

```tsx
"use client";
import { DeviceAccessory } from "@repo/components/home/device-accessory";
import { useEntity, useHass } from "@repo/home-assistant/hooks";

export function Accessory({ id }: { id: string }) {
    const entity = useEntity(id);
    const { status, callService } = useHass();
    if (!entity) return null;
    return (
        <DeviceAccessory
            entity={entity}
            disabled={status !== "connected"}
            onCommand={async ({ domain, service, data, target }) => {
                await callService(domain, service, data, target);
            }}
        />
    );
}
```

`DeviceAccessory` renders a compact tile and its accessible control sheet. The circle performs a safe, explicit on/off action when one exists; the text opens details. Security and other consequential operations are only available inside the sheet and require confirmation. `DeviceControlInput` and `DeviceIcon` are separately exported under `@repo/components/home/*` for composing custom panels.

`getDeviceModel(entity)` and `buildDeviceCommand(entity, controlId, value?, code?)` live in `@repo/home-assistant/controls`. Models are pure, serializable and capability-driven. Build commands again against current state immediately before dispatch. A custom renderer must honor `available`, `confirmation` and `codeRequired`; the command builder validates values but cannot prove a user confirmed a dialog.

## Coverage

Controls appear only when the integration advertises the required feature, options and bounds.

| Family | Supported controls |
| --- | --- |
| Lights | Power, brightness, supported colours, colour temperature, effects |
| Switches and boolean helpers | Explicit on/off |
| Fans | Power, percentage speed, oscillation, direction, presets |
| Covers and valves | Open, close, stop and supported positions; cover tilt |
| Climate | HVAC mode, target temperature/range, presets, fan and swing modes, supported power |
| Humidifiers and water heaters | Power, target humidity/temperature and advertised modes |
| Media players | Supported transport, power, volume/mute, source, sound mode, shuffle and repeat |
| Locks and alarms | Supported lock/unlock/open and arm/disarm modes with confirmation and transient codes |
| Vacuums and lawn mowers | Supported cleaning/start, pause, stop, dock and fan speed |
| Sirens | Supported power, tone choices (including numeric IDs) and volume |
| Remotes | Advertised power |
| Scenes, scripts, buttons, automations | Confirmed activation, supported run/stop, enable/disable |
| Numeric and selection entities/helpers | Validated ranges and advertised options |
| Text, date, time and datetime entities/helpers | Explicit Apply, input constraints and timezone-aware datetime handling |
| Counters, timers and updates | Supported standard lifecycle operations with confirmation where applicable |
| Sensors, binary sensors, people, trackers, weather, cameras, images, calendars, todo lists, events and unknown domains | Read-only state and selected safe metadata |

This is a reusable foundation across domain families, not an implementation of every integration-specific service. Camera stream playback, media browsing/search/grouping, arbitrary remote codes, cleaning maps/areas, calendar and todo editing, custom update versions/backups, siren duration and custom timer durations require dedicated components and schemas. The generic fallback keeps those entities inspectable without inventing actions. Camera/image URLs are never embedded from entity attributes, which may contain credentials.

## Interaction and reliability

- Dialogs trap focus, close with Escape and restore focus to the initiating tile. Mobile sheets fit the viewport; controls use at least 44px interaction targets.
- Sliders keep drag values local and send once on release or keyboard commit. Text/colour fields send only on Apply. Real state always comes from Home Assistant; a successful service response does not fabricate device state.
- Pending actions are deduplicated per accessory. Reconnecting/unavailable devices remain inspectable with controls disabled. Failures remain visible and never trigger automatic service retries.
- PINs are held only in transient form fields and the immediate command payload. Password helper values are masked, and submitted password fields clear.
- Normal grids subscribe to entity IDs and room metadata. Each accessory subscribes to its own entity; search subscribes separately while active.
- Reduced-motion settings disable animated transitions. Desktop dialogs and mobile sheets share the same accessible control implementation.

## Styling and icons

The violet/coral wallpaper, translucent room navigation, active white tiles, rounded sheets and system typography take visual direction from the supplied reference. CSS classes are scoped with `home-` / `home-dashboard-`; change shared surfaces and motion in `packages/components/styles/home.css` and the application layout in `apps/web/components/home/dashboard.css`.

Icons use the installed `@bradleyhodges/sfsymbols` and `@bradleyhodges/sfsymbols-react` packages. Prefer their named exports; use Tabler only for missing suitable symbols. shadcn's supported fallback library is configured as Tabler so future generated components do not reintroduce Lucide. Review generated icons and replace with SF Symbols where suitable. See the upstream [SF Symbols package usage and license terms](https://github.com/bradleyhodges/sfsymbols) before redistribution; the package documents Apple-platform restrictions.

## Validation boundaries

Unit tests exercise command mapping, registry lifecycle, security confirmation, cancellation, unavailable state, duplicate suppression, error handling, keyboard sliders and dialog focus. The sample adapter is tested independently. Browser checks use only the isolated sample home; they do not establish physical device compatibility or actuate a real home.

Verified on 2026-09-06: `pnpm check` passed all workspace typechecks and 114 tests across 18 files. Biome reports five existing warnings in the connection test, clipboard hook, generated field/label components and image optimizer environment declaration. Desktop and 390×844 mobile browser checks covered rendering, brightness dragging, modal focus, lock confirmation/cancel and the expanded catalog, with no browser console errors observed.
