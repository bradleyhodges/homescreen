import type { HassEntity } from "@repo/home-assistant";
import type { DeviceCommand } from "@repo/home-assistant/controls";

/** Preview-only state simulation. No network access, service client, or credential persistence. */
export function applySampleCommand(
    entities: Readonly<Record<string, HassEntity>>,
    command: DeviceCommand,
): Record<string, HassEntity> {
    const previous = entities[command.target.entity_id];
    if (!previous || previous.entity_id.split(".")[0] !== command.domain)
        throw new Error("This accessory is not part of the sample home.");
    const data = command.data ?? {};
    const attributes: Record<string, unknown> = { ...previous.attributes };
    let state = previous.state;
    const timestamp = new Date().toISOString();
    const service = command.service;
    switch (service) {
        case "turn_on":
            state = command.domain === "scene" ? timestamp : "on";
            if (data.brightness_pct !== undefined)
                attributes.brightness = Math.round(
                    (Number(data.brightness_pct) / 100) * 255,
                );
            if (data.color_temp_kelvin !== undefined)
                attributes.color_temp_kelvin = data.color_temp_kelvin;
            if (data.hs_color !== undefined) {
                attributes.hs_color = data.hs_color;
                attributes.rgb_color = hsRgb(data.hs_color);
            }
            if (data.effect !== undefined) attributes.effect = data.effect;
            if (data.activity !== undefined)
                attributes.current_activity = data.activity;
            break;
        case "turn_off":
            state = "off";
            break;
        case "set_percentage":
            attributes.percentage = data.percentage;
            state = Number(data.percentage) > 0 ? "on" : "off";
            break;
        case "oscillate":
            attributes.oscillating = data.oscillating;
            break;
        case "set_direction":
            attributes.direction = data.direction;
            break;
        case "set_preset_mode":
            attributes.preset_mode = data.preset_mode;
            break;
        case "open_cover":
        case "open_valve":
            state = "open";
            attributes.current_position = 100;
            break;
        case "close_cover":
        case "close_valve":
            state = "closed";
            attributes.current_position = 0;
            break;
        case "stop_cover":
        case "stop_valve":
            state = Number(attributes.current_position) > 0 ? "open" : "closed";
            break;
        case "set_cover_position":
        case "set_valve_position":
            attributes.current_position = data.position;
            state = Number(data.position) > 0 ? "open" : "closed";
            break;
        case "open_cover_tilt":
            attributes.current_tilt_position = 100;
            break;
        case "close_cover_tilt":
            attributes.current_tilt_position = 0;
            break;
        case "stop_cover_tilt":
            break;
        case "set_cover_tilt_position":
            attributes.current_tilt_position = data.tilt_position;
            break;
        case "set_hvac_mode":
            state = String(data.hvac_mode);
            break;
        case "set_temperature":
            for (const key of [
                "temperature",
                "target_temp_low",
                "target_temp_high",
            ] as const)
                if (data[key] !== undefined) attributes[key] = data[key];
            break;
        case "set_humidity":
            attributes.humidity = data.humidity;
            break;
        case "set_fan_mode":
            attributes.fan_mode = data.fan_mode;
            break;
        case "set_swing_mode":
            attributes.swing_mode = data.swing_mode;
            break;
        case "set_swing_horizontal_mode":
            attributes.swing_horizontal_mode = data.swing_horizontal_mode;
            break;
        case "set_mode":
            attributes.mode = data.mode;
            break;
        case "set_operation_mode":
            attributes.operation_mode = data.operation_mode;
            state = String(data.operation_mode);
            break;
        case "set_away_mode":
            attributes.away_mode = data.away_mode ? "on" : "off";
            break;
        case "media_play":
            state = "playing";
            break;
        case "media_pause":
            state = "paused";
            break;
        case "media_stop":
            state = "idle";
            break;
        case "media_next_track":
            attributes.media_title = "Evening colours";
            break;
        case "media_previous_track":
            attributes.media_title = "A quiet kind of evening";
            break;
        case "volume_up":
            attributes.volume_level = Math.min(
                1,
                Number(attributes.volume_level ?? 0) + 0.05,
            );
            break;
        case "volume_down":
            attributes.volume_level = Math.max(
                0,
                Number(attributes.volume_level ?? 0) - 0.05,
            );
            break;
        case "volume_set":
            attributes.volume_level = data.volume_level;
            break;
        case "volume_mute":
            attributes.is_volume_muted = data.is_volume_muted;
            break;
        case "select_source":
            attributes.source = data.source;
            break;
        case "select_sound_mode":
            attributes.sound_mode = data.sound_mode;
            break;
        case "shuffle_set":
            attributes.shuffle = data.shuffle;
            break;
        case "repeat_set":
            attributes.repeat = data.repeat;
            break;
        case "lock":
            state = "locked";
            break;
        case "unlock":
        case "open":
            state = "unlocked";
            break;
        case "alarm_disarm":
            state = "disarmed";
            break;
        case "alarm_arm_home":
        case "alarm_arm_away":
        case "alarm_arm_night":
        case "alarm_arm_custom_bypass":
        case "alarm_arm_vacation":
            state = service.replace("alarm_arm_", "armed_");
            break;
        case "alarm_trigger":
            state = "triggered";
            break;
        case "start":
            state = command.domain === "timer" ? "active" : "cleaning";
            break;
        case "pause":
            state = "paused";
            break;
        case "stop":
            state = "idle";
            break;
        case "return_to_base":
        case "dock":
            state = "docked";
            break;
        case "locate":
            attributes.last_located = timestamp;
            break;
        case "clean_spot":
            state = "cleaning";
            break;
        case "set_fan_speed":
            attributes.fan_speed = data.fan_speed;
            break;
        case "start_mowing":
            state = "mowing";
            break;
        case "press":
            state = timestamp;
            break;
        case "trigger":
            attributes.last_triggered = timestamp;
            break;
        case "set_value":
            state = String(
                data.value ?? data.date ?? data.time ?? data.datetime ?? "",
            );
            break;
        case "set_datetime":
            state = String(data.datetime ?? data.date ?? data.time ?? "");
            break;
        case "select_option":
            state = String(data.option);
            break;
        case "increment":
            state = String(
                Math.min(
                    Number(attributes.maximum ?? Number.MAX_SAFE_INTEGER),
                    Number(state) + Number(attributes.step ?? 1),
                ),
            );
            break;
        case "decrement":
            state = String(
                Math.max(
                    Number(attributes.minimum ?? Number.MIN_SAFE_INTEGER),
                    Number(state) - Number(attributes.step ?? 1),
                ),
            );
            break;
        case "reset":
            state = String(attributes.initial ?? 0);
            break;
        case "cancel":
        case "finish":
            state = "idle";
            break;
        case "install":
            state = "off";
            attributes.installed_version = attributes.latest_version;
            break;
        default:
            throw new Error("This action is not simulated in the sample home.");
    }
    return {
        ...entities,
        [previous.entity_id]: {
            ...previous,
            state,
            attributes,
            last_changed:
                state === previous.state ? previous.last_changed : timestamp,
            last_updated: timestamp,
        },
    };
}

function hsRgb(value: unknown): [number, number, number] {
    if (!Array.isArray(value) || value.length !== 2)
        throw new Error("Invalid sample color.");
    const hue = Number(value[0]) / 60,
        saturation = Number(value[1]) / 100;
    const x = saturation * (1 - Math.abs((hue % 2) - 1));
    const rgb =
        hue < 1
            ? [saturation, x, 0]
            : hue < 2
              ? [x, saturation, 0]
              : hue < 3
                ? [0, saturation, x]
                : hue < 4
                  ? [0, x, saturation]
                  : hue < 5
                    ? [x, 0, saturation]
                    : [saturation, 0, x];
    return rgb.map((channel) =>
        Math.round((channel + 1 - saturation) * 255),
    ) as [number, number, number];
}
