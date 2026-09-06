import type { HassEntity } from "home-assistant-js-websocket";

/** Entity shape accepted by the device UI without importing the SDK. */
export type DeviceEntity = HassEntity;

interface ControlBase {
    id: string;
    label: string;
    confirmation?: string;
    codeRequired?: boolean;
}

/** Serializable controls contain no credentials or executable callbacks. */
export type DeviceControl = ControlBase &
    (
        | { kind: "action" }
        | { kind: "toggle"; value: boolean }
        | {
              kind: "range";
              value: number;
              min: number;
              max: number;
              step: number;
              unit?: string;
          }
        | {
              kind: "select";
              value: string;
              options: { label: string; value: string }[];
          }
        | { kind: "color"; value: string }
        | {
              kind: "text";
              value: string;
              inputType?:
                  | "text"
                  | "password"
                  | "date"
                  | "time"
                  | "datetime-local";
              minLength?: number;
              maxLength?: number;
              pattern?: string;
          }
    );

/** A single, explicitly targeted service call. Callers must honor confirmation. */
export interface DeviceCommand {
    domain: string;
    service: string;
    data?: Record<string, unknown>;
    target: { entity_id: string };
    confirmation?: string;
}

/** Presentation model derived solely from the current entity snapshot. */
export interface DeviceModel {
    id: string;
    domain: string;
    name: string;
    stateLabel: string;
    active: boolean;
    available: boolean;
    category:
        | "Lighting"
        | "Climate"
        | "Security"
        | "Entertainment"
        | "Appliances"
        | "Sensors"
        | "Other";
    controls: DeviceControl[];
    primary?: DeviceCommand;
}

interface Definition {
    control: DeviceControl;
    service: string | ((value: unknown) => string);
    data?: (value: unknown) => Record<string, unknown>;
}

const humanize = (value: string) =>
    value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const number = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
const strings = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
const available = (entity: HassEntity) =>
    entity.state !== "unavailable" && entity.state !== "unknown";

// Feature bits match homeassistant/components/<domain>/{const,__init__}.py.
// Keep this allowlist conservative: integration-specific actions need a schema.
function definitions(entity: HassEntity): Definition[] {
    const domain = entity.entity_id.split(".")[0];
    const a: Record<string, unknown> = entity.attributes;
    const features = number(a.supported_features) ?? 0;
    const has = (flag: number) => (features & flag) === flag;
    const result: Definition[] = [];
    const action = (
        id: string,
        label: string,
        flag?: number,
        confirmation?: string,
        codeRequired?: boolean,
    ) => {
        if (flag !== undefined && !has(flag)) return;
        result.push({
            control: {
                kind: "action",
                id,
                label,
                ...(confirmation ? { confirmation } : {}),
                ...(codeRequired ? { codeRequired } : {}),
            },
            service: id,
        });
    };
    const toggle = (
        id: string,
        label: string,
        value: boolean,
        service: Definition["service"],
        key?: string,
    ) => {
        result.push({
            control: { kind: "toggle", id, label, value },
            service,
            ...(key ? { data: (value: unknown) => ({ [key]: value }) } : {}),
        });
    };
    const power = () =>
        toggle("power", "Power", entity.state !== "off", (value) =>
            value ? "turn_on" : "turn_off",
        );
    const range = (
        id: string,
        label: string,
        value: unknown,
        min: unknown,
        max: unknown,
        step: unknown,
        service: string,
        key: string,
        unit?: string,
        confirmation?: string,
    ) => {
        const lower = number(min),
            upper = number(max),
            increment = number(step);
        if (
            lower === undefined ||
            upper === undefined ||
            increment === undefined ||
            lower >= upper ||
            increment <= 0
        )
            return;
        result.push({
            control: {
                kind: "range",
                id,
                label,
                value: Math.min(upper, Math.max(lower, number(value) ?? lower)),
                min: lower,
                max: upper,
                step: increment,
                ...(unit ? { unit } : {}),
                ...(confirmation ? { confirmation } : {}),
            },
            service,
            data: (value) => ({ [key]: value }),
        });
    };
    const select = (
        id: string,
        label: string,
        value: unknown,
        options: unknown,
        service: string,
        key: string,
    ) => {
        const list = strings(options);
        if (!list.length) return;
        result.push({
            control: {
                kind: "select",
                id,
                label,
                value: typeof value === "string" ? value : "",
                options: list.map((value) => ({
                    label: humanize(value),
                    value,
                })),
            },
            service,
            data: (value) => ({ [key]: value }),
        });
    };
    const text = (
        id: string,
        label: string,
        value: string,
        service: string,
        key: string,
        inputType:
            | "text"
            | "password"
            | "date"
            | "time"
            | "datetime-local" = "text",
    ) => {
        result.push({
            control: {
                kind: "text",
                id,
                label,
                value,
                inputType,
                minLength: number(a.min) ?? 0,
                maxLength: number(a.max) ?? 255,
                ...(typeof a.pattern === "string"
                    ? { pattern: a.pattern }
                    : {}),
            },
            service,
            data: (value) => ({ [key]: value }),
        });
    };
    switch (domain) {
        case "light": {
            power();
            const modes = strings(a.supported_color_modes);
            if (modes.some((mode) => !["onoff", "unknown"].includes(mode)))
                range(
                    "brightness",
                    "Brightness",
                    ((number(a.brightness) ?? 0) / 255) * 100,
                    0,
                    100,
                    1,
                    "turn_on",
                    "brightness_pct",
                    "%",
                );
            if (modes.includes("color_temp"))
                range(
                    "color_temperature",
                    "Color temperature",
                    a.color_temp_kelvin,
                    a.min_color_temp_kelvin,
                    a.max_color_temp_kelvin,
                    1,
                    "turn_on",
                    "color_temp_kelvin",
                    "K",
                );
            if (
                modes.some((mode) =>
                    ["hs", "xy", "rgb", "rgbw", "rgbww"].includes(mode),
                )
            ) {
                result.push({
                    control: {
                        kind: "color",
                        id: "color",
                        label: "Color",
                        value: rgbHex(a.rgb_color),
                    },
                    service: "turn_on",
                    data: (value) => ({ hs_color: hexHs(value as string) }),
                });
            }
            if (has(4))
                select(
                    "effect",
                    "Effect",
                    a.effect,
                    a.effect_list,
                    "turn_on",
                    "effect",
                );
            break;
        }
        case "switch":
        case "input_boolean":
            power();
            break;
        case "fan":
            if (has(16) && has(32)) power();
            else {
                action("turn_on", "Turn on", 32);
                action("turn_off", "Turn off", 16);
            }
            if (has(1))
                range(
                    "percentage",
                    "Speed",
                    a.percentage,
                    0,
                    100,
                    a.percentage_step ?? 1,
                    "set_percentage",
                    "percentage",
                    "%",
                );
            if (has(2))
                toggle(
                    "oscillating",
                    "Oscillate",
                    a.oscillating === true,
                    "oscillate",
                    "oscillating",
                );
            if (has(4))
                select(
                    "direction",
                    "Direction",
                    a.direction,
                    ["forward", "reverse"],
                    "set_direction",
                    "direction",
                );
            if (has(8))
                select(
                    "preset",
                    "Preset",
                    a.preset_mode,
                    a.preset_modes,
                    "set_preset_mode",
                    "preset_mode",
                );
            break;
        case "cover":
        case "valve": {
            const warning =
                domain === "valve"
                    ? "This changes the valve and may release water or gas. Continue?"
                    : ["garage", "gate", "door"].includes(
                            String(a.device_class),
                        )
                      ? "This moves an access door. Check that the area is clear. Continue?"
                      : "This moves the cover. Check that the area is clear. Continue?";
            action(`open_${domain}`, "Open", 1, warning);
            action(`close_${domain}`, "Close", 2, warning);
            action(`stop_${domain}`, "Stop", 8);
            if (has(4))
                range(
                    "position",
                    "Position",
                    a.current_position,
                    0,
                    100,
                    1,
                    `set_${domain}_position`,
                    "position",
                    "%",
                    warning,
                );
            if (domain === "cover") {
                action("open_cover_tilt", "Open tilt", 16, warning);
                action("close_cover_tilt", "Close tilt", 32, warning);
                action("stop_cover_tilt", "Stop tilt", 64);
                if (has(128))
                    range(
                        "tilt",
                        "Tilt",
                        a.current_tilt_position,
                        0,
                        100,
                        1,
                        "set_cover_tilt_position",
                        "tilt_position",
                        "%",
                        warning,
                    );
            }
            break;
        }
        case "climate":
            select(
                "hvac_mode",
                "Mode",
                entity.state,
                a.hvac_modes,
                "set_hvac_mode",
                "hvac_mode",
            );
            if (has(1))
                range(
                    "temperature",
                    "Target temperature",
                    a.temperature,
                    a.min_temp,
                    a.max_temp,
                    a.target_temp_step ?? 0.5,
                    "set_temperature",
                    "temperature",
                );
            if (has(2)) {
                range(
                    "target_temp_low",
                    "Lower temperature",
                    a.target_temp_low,
                    a.min_temp,
                    a.max_temp,
                    a.target_temp_step ?? 0.5,
                    "set_temperature",
                    "target_temp_low",
                );
                range(
                    "target_temp_high",
                    "Upper temperature",
                    a.target_temp_high,
                    a.min_temp,
                    a.max_temp,
                    a.target_temp_step ?? 0.5,
                    "set_temperature",
                    "target_temp_high",
                );
            }
            if (has(4))
                range(
                    "humidity",
                    "Target humidity",
                    a.humidity,
                    a.min_humidity,
                    a.max_humidity,
                    1,
                    "set_humidity",
                    "humidity",
                    "%",
                );
            for (const [flag, key, label] of [
                [8, "fan", "Fan"],
                [16, "preset", "Preset"],
                [32, "swing", "Swing"],
                [512, "swing_horizontal", "Horizontal swing"],
            ] as const)
                if (has(flag))
                    select(
                        `${key}_mode`,
                        label,
                        a[`${key}_mode`],
                        a[`${key}_modes`],
                        `set_${key}_mode`,
                        `${key}_mode`,
                    );
            action("turn_on", "Turn on", 256);
            action("turn_off", "Turn off", 128);
            break;
        case "humidifier":
            power();
            range(
                "humidity",
                "Target humidity",
                a.humidity,
                a.min_humidity,
                a.max_humidity,
                1,
                "set_humidity",
                "humidity",
                "%",
            );
            if (has(1))
                select(
                    "mode",
                    "Mode",
                    a.mode,
                    a.available_modes,
                    "set_mode",
                    "mode",
                );
            break;
        case "water_heater":
            if (has(8)) power();
            if (has(1))
                range(
                    "temperature",
                    "Target temperature",
                    a.temperature,
                    a.min_temp,
                    a.max_temp,
                    a.target_temp_step ?? 1,
                    "set_temperature",
                    "temperature",
                );
            if (has(2))
                select(
                    "operation_mode",
                    "Mode",
                    a.operation_mode,
                    a.operation_list,
                    "set_operation_mode",
                    "operation_mode",
                );
            if (has(4))
                toggle(
                    "away_mode",
                    "Away mode",
                    a.away_mode === "on" || a.away_mode === true,
                    "set_away_mode",
                    "away_mode",
                );
            break;
        case "media_player":
            for (const [flag, service, label] of [
                [128, "turn_on", "Turn on"],
                [256, "turn_off", "Turn off"],
                [16384, "media_play", "Play"],
                [1, "media_pause", "Pause"],
                [4096, "media_stop", "Stop"],
                [16, "media_previous_track", "Previous"],
                [32, "media_next_track", "Next"],
                [1024, "volume_up", "Volume up"],
                [1024, "volume_down", "Volume down"],
            ] as const)
                action(service, label, flag);
            if (has(4))
                range(
                    "volume",
                    "Volume",
                    a.volume_level,
                    0,
                    1,
                    0.01,
                    "volume_set",
                    "volume_level",
                );
            if (has(8))
                toggle(
                    "mute",
                    "Mute",
                    a.is_volume_muted === true,
                    "volume_mute",
                    "is_volume_muted",
                );
            if (has(2048))
                select(
                    "source",
                    "Source",
                    a.source,
                    a.source_list,
                    "select_source",
                    "source",
                );
            if (has(65536))
                select(
                    "sound_mode",
                    "Sound mode",
                    a.sound_mode,
                    a.sound_mode_list,
                    "select_sound_mode",
                    "sound_mode",
                );
            if (has(32768))
                toggle(
                    "shuffle",
                    "Shuffle",
                    a.shuffle === true,
                    "shuffle_set",
                    "shuffle",
                );
            if (has(262144))
                select(
                    "repeat",
                    "Repeat",
                    a.repeat,
                    ["off", "all", "one"],
                    "repeat_set",
                    "repeat",
                );
            break;
        case "lock":
            action(
                "lock",
                "Lock",
                undefined,
                "Lock this door?",
                !!a.code_format,
            );
            action(
                "unlock",
                "Unlock",
                undefined,
                "Unlock this door and allow access?",
                !!a.code_format,
            );
            action(
                "open",
                "Open latch",
                1,
                "Open this door's latch and allow access?",
                !!a.code_format,
            );
            break;
        case "alarm_control_panel":
            action(
                "alarm_disarm",
                "Disarm",
                undefined,
                "Disarm the alarm and disable protection?",
                !!a.code_format,
            );
            for (const [flag, mode] of [
                [1, "home"],
                [2, "away"],
                [4, "night"],
                [16, "custom_bypass"],
                [32, "vacation"],
            ] as const)
                action(
                    `alarm_arm_${mode}`,
                    `Arm ${humanize(mode).toLowerCase()}`,
                    flag,
                    "Arm the alarm?",
                    !!a.code_format && a.code_arm_required !== false,
                );
            action(
                "alarm_trigger",
                "Trigger alarm",
                8,
                "Trigger the alarm? This may sound a siren or notify emergency contacts.",
                !!a.code_format,
            );
            break;
        case "vacuum":
            for (const [flag, service, label] of [
                [8192, "start", "Start cleaning"],
                [4, "pause", "Pause"],
                [8, "stop", "Stop"],
                [16, "return_to_base", "Return to dock"],
                [512, "locate", "Locate"],
                [1024, "clean_spot", "Clean spot"],
            ] as const)
                action(service, label, flag);
            if (has(32))
                select(
                    "fan_speed",
                    "Cleaning power",
                    a.fan_speed,
                    a.fan_speed_list,
                    "set_fan_speed",
                    "fan_speed",
                );
            break;
        case "lawn_mower":
            action(
                "start_mowing",
                "Start mowing",
                1,
                "Start the mower? Check that the lawn is clear.",
            );
            action("pause", "Pause", 2);
            action("dock", "Return to dock", 4);
            break;
        case "siren":
            action("turn_on", "Sound siren", 1, "Sound the siren?");
            action("turn_off", "Stop siren", 2);
            if (has(1) && has(4)) {
                select(
                    "tone",
                    "Sound with tone",
                    "",
                    a.available_tones,
                    "turn_on",
                    "tone",
                );
                const tone = result.find(
                    ({ control }) => control.id === "tone",
                );
                if (tone)
                    tone.control.confirmation =
                        "Sound the siren with this tone?";
            }
            if (has(1) && has(8))
                range(
                    "volume",
                    "Sound at volume",
                    a.volume_level,
                    0,
                    1,
                    0.05,
                    "turn_on",
                    "volume_level",
                    undefined,
                    "Sound the siren at this volume?",
                );
            break;
        case "remote":
            power();
            if (has(4))
                select(
                    "activity",
                    "Activity",
                    a.current_activity,
                    a.activity_list,
                    "turn_on",
                    "activity",
                );
            break;
        case "scene":
            action(
                "turn_on",
                "Activate",
                undefined,
                "Activate this scene? It may control multiple devices.",
            );
            break;
        case "script":
            action(
                "turn_on",
                "Run",
                undefined,
                "Run this script? It may control multiple devices.",
            );
            if (entity.state === "on") action("turn_off", "Stop");
            break;
        case "button":
        case "input_button":
            action("press", "Press", undefined, "Run this button's action?");
            break;
        case "automation":
            power();
            action(
                "trigger",
                "Run actions",
                undefined,
                "Run this automation's actions?",
            );
            break;
        case "number":
        case "input_number":
            range(
                "value",
                "Value",
                Number(entity.state),
                a.min,
                a.max,
                a.step,
                "set_value",
                "value",
                typeof a.unit_of_measurement === "string"
                    ? a.unit_of_measurement
                    : undefined,
            );
            break;
        case "select":
        case "input_select":
            select(
                "option",
                "Option",
                entity.state,
                a.options,
                "select_option",
                "option",
            );
            break;
        case "text":
        case "input_text":
            text(
                "value",
                "Value",
                a.mode === "password" ? "" : entity.state,
                "set_value",
                "value",
                a.mode === "password" ? "password" : "text",
            );
            break;
        case "date":
            text("date", "Date", entity.state, "set_value", "date", "date");
            break;
        case "time":
            text("time", "Time", entity.state, "set_value", "time", "time");
            break;
        case "datetime":
            text(
                "datetime",
                "Date and time",
                entity.state.replace(" ", "T"),
                "set_value",
                "datetime",
                "datetime-local",
            );
            break;
        case "input_datetime": {
            const both = a.has_date === true && a.has_time === true;
            if (both)
                text(
                    "datetime",
                    "Date and time",
                    entity.state.replace(" ", "T"),
                    "set_datetime",
                    "datetime",
                    "datetime-local",
                );
            else if (a.has_date === true)
                text(
                    "date",
                    "Date",
                    entity.state,
                    "set_datetime",
                    "date",
                    "date",
                );
            else if (a.has_time === true)
                text(
                    "time",
                    "Time",
                    entity.state,
                    "set_datetime",
                    "time",
                    "time",
                );
            break;
        }
        case "counter":
            action("increment", "Increase");
            action("decrement", "Decrease");
            action(
                "reset",
                "Reset",
                undefined,
                "Reset this counter to its initial value?",
            );
            break;
        case "timer":
            action("start", entity.state === "paused" ? "Resume" : "Start");
            if (entity.state === "active") action("pause", "Pause");
            if (entity.state !== "idle") {
                action("cancel", "Cancel");
                action(
                    "finish",
                    "Finish",
                    undefined,
                    "Finish this timer? This may trigger automations.",
                );
            }
            break;
        case "update":
            if (entity.state === "on" && !a.in_progress)
                action(
                    "install",
                    "Install update",
                    1,
                    "Install this update? The device may restart or be unavailable.",
                );
            break;
    }
    return result;
}

function rgbHex(value: unknown): string {
    if (!Array.isArray(value) || value.length < 3) return "#ffffff";
    return `#${value
        .slice(0, 3)
        .map((channel) =>
            Math.round(Math.min(255, Math.max(0, number(channel) ?? 255)))
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
}

function hexHs(value: string): [number, number] {
    const r = Number.parseInt(value.slice(1, 3), 16) / 255,
        g = Number.parseInt(value.slice(3, 5), 16) / 255,
        b = Number.parseInt(value.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        delta = max - min;
    const hue =
        delta === 0
            ? 0
            : max === r
              ? ((g - b) / delta) % 6
              : max === g
                ? (b - r) / delta + 2
                : (r - g) / delta + 4;
    return [(hue * 60 + 360) % 360, max === 0 ? 0 : (delta / max) * 100];
}

/** Build a capability-aware model; unknown domains remain inspectable and read-only. */
export function getDeviceModel(entity: HassEntity): DeviceModel {
    const domain = entity.entity_id.split(".")[0] ?? "unknown";
    const a: Record<string, unknown> = entity.attributes;
    let stateLabel =
        ["text", "input_text"].includes(domain) &&
        a.mode === "password" &&
        available(entity)
            ? "Protected value"
            : humanize(entity.state);
    if (domain === "binary_sensor" && ["on", "off"].includes(entity.state)) {
        const states: Record<string, [string, string]> = {
            door: ["Open", "Closed"],
            window: ["Open", "Closed"],
            opening: ["Open", "Closed"],
            garage_door: ["Open", "Closed"],
            lock: ["Unlocked", "Locked"],
            motion: ["Motion detected", "Clear"],
            occupancy: ["Occupied", "Clear"],
            presence: ["Present", "Away"],
            moisture: ["Wet", "Dry"],
            smoke: ["Smoke detected", "Clear"],
            gas: ["Gas detected", "Clear"],
            safety: ["Unsafe", "Safe"],
            problem: ["Problem", "Clear"],
            connectivity: ["Connected", "Disconnected"],
            battery: ["Low battery", "Normal"],
        };
        const labels = states[String(a.device_class)];
        if (labels) stateLabel = labels[entity.state === "on" ? 0 : 1];
    }
    if (available(entity) && typeof a.unit_of_measurement === "string")
        stateLabel += ` ${a.unit_of_measurement}`;
    const model: DeviceModel = {
        id: entity.entity_id,
        domain,
        name:
            typeof a.friendly_name === "string"
                ? a.friendly_name
                : humanize(entity.entity_id.split(".").slice(1).join(".")),
        stateLabel,
        active:
            available(entity) &&
            ![
                "off",
                "idle",
                "closed",
                "locked",
                "disarmed",
                "not_home",
                "standby",
            ].includes(entity.state),
        available: available(entity),
        category: ["light"].includes(domain)
            ? "Lighting"
            : ["climate", "fan", "humidifier", "water_heater"].includes(domain)
              ? "Climate"
              : ["lock", "alarm_control_panel", "camera"].includes(domain)
                ? "Security"
                : ["media_player", "remote"].includes(domain)
                  ? "Entertainment"
                  : [
                          "sensor",
                          "binary_sensor",
                          "weather",
                          "person",
                          "device_tracker",
                      ].includes(domain)
                    ? "Sensors"
                    : [
                            "vacuum",
                            "lawn_mower",
                            "switch",
                            "cover",
                            "valve",
                        ].includes(domain)
                      ? "Appliances"
                      : "Other",
        controls: definitions(entity).map(({ control }) => control),
    };
    if (
        model.available &&
        ["light", "switch", "input_boolean", "fan", "humidifier"].includes(
            domain,
        ) &&
        model.controls.some((control) => control.id === "power")
    )
        model.primary = buildDeviceCommand(
            entity,
            "power",
            entity.state === "off",
        );
    return model;
}

/** Recheck live capabilities and validate input immediately before a service call. */
export function buildDeviceCommand(
    entity: HassEntity,
    controlId: string,
    value?: unknown,
    code?: string,
): DeviceCommand {
    if (!available(entity)) throw new Error("This device is unavailable.");
    const definition = definitions(entity).find(
        ({ control }) => control.id === controlId,
    );
    if (!definition)
        throw new Error("This control is not supported by the device.");
    const { control } = definition;
    if (control.kind === "toggle" && typeof value !== "boolean")
        throw new Error("Choose on or off.");
    if (
        control.kind === "range" &&
        (typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < control.min ||
            value > control.max)
    )
        throw new Error(
            `Choose a value between ${control.min} and ${control.max}.`,
        );
    if (
        control.kind === "select" &&
        !control.options.some((option) => option.value === value)
    )
        throw new Error("Choose an available option.");
    if (
        control.kind === "color" &&
        (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
    )
        throw new Error("Choose a valid color.");
    if (control.kind === "text") {
        if (
            typeof value !== "string" ||
            value.length < (control.minLength ?? 0) ||
            value.length > (control.maxLength ?? 255)
        )
            throw new Error("Enter a value within the allowed length.");
        if (control.pattern) {
            let pattern: RegExp;
            try {
                pattern = new RegExp(`^(?:${control.pattern})$`);
            } catch {
                throw new Error(
                    "The device supplied an invalid input pattern.",
                );
            }
            if (!pattern.test(value))
                throw new Error(
                    "The value does not match the required format.",
                );
        }
        if (
            control.inputType === "date" &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !validDate(value))
        )
            throw new Error("Enter a valid date.");
        if (
            control.inputType === "time" &&
            !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
        )
            throw new Error("Enter a valid time.");
        if (
            control.inputType === "datetime-local" &&
            (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(
                value,
            ) ||
                !validDate(value.slice(0, 10)))
        )
            throw new Error("Enter a valid date and time.");
    }
    if (control.codeRequired && !code?.trim())
        throw new Error("Enter the device's security code.");
    if (
        code &&
        entity.attributes.code_format === "number" &&
        !/^\d+$/.test(code)
    )
        throw new Error("The security code must contain only digits.");
    if (
        code &&
        entity.entity_id.startsWith("lock.") &&
        typeof entity.attributes.code_format === "string" &&
        entity.attributes.code_format !== "number"
    ) {
        let format: RegExp;
        try {
            format = new RegExp(`^(?:${entity.attributes.code_format})$`);
        } catch {
            throw new Error(
                "The device supplied an unsupported security code format.",
            );
        }
        if (!format.test(code))
            throw new Error(
                "The security code does not match the required format.",
            );
    }
    const data = definition.data?.(value) ?? {};
    if (control.codeRequired && code) data.code = code;
    if (controlId === "target_temp_low" || controlId === "target_temp_high") {
        const otherKey =
            controlId === "target_temp_low"
                ? "target_temp_high"
                : "target_temp_low";
        const other = number(entity.attributes[otherKey]);
        if (other === undefined)
            throw new Error(
                "The device has not supplied both target temperatures.",
            );
        data[otherKey] = other;
        if (Number(data.target_temp_low) > Number(data.target_temp_high))
            throw new Error(
                "The lower temperature cannot exceed the upper temperature.",
            );
    }
    return {
        domain: entity.entity_id.split(".")[0] ?? "unknown",
        service:
            typeof definition.service === "function"
                ? definition.service(value)
                : definition.service,
        target: { entity_id: entity.entity_id },
        ...(Object.keys(data).length ? { data } : {}),
        ...(control.confirmation ? { confirmation: control.confirmation } : {}),
    };
}

function validDate(value: string): boolean {
    const date = new Date(`${value}T00:00:00Z`);
    return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}
