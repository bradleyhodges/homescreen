import { describe, expect, it } from "vitest";
import {
    buildDeviceCommand,
    type DeviceEntity,
    getDeviceModel,
} from "./controls";

const entity = (
    domain: string,
    attributes: Record<string, unknown> = {},
    state = "on",
): DeviceEntity => ({
    entity_id: `${domain}.test`,
    state,
    attributes,
    last_changed: "2026-09-06T00:00:00Z",
    last_updated: "2026-09-06T00:00:00Z",
    context: { id: "test", parent_id: null, user_id: null },
});
const ids = (device: DeviceEntity) =>
    getDeviceModel(device).controls.map((control) => control.id);

describe("capability boundaries", () => {
    it("keeps unknown entities inspectable without inventing actions", () => {
        for (const domain of [
            "sensor",
            "binary_sensor",
            "person",
            "device_tracker",
            "weather",
            "camera",
            "image",
            "calendar",
            "todo",
            "event",
            "custom",
        ]) {
            const model = getDeviceModel(
                entity(
                    domain,
                    { friendly_name: "Reading", unit_of_measurement: "°C" },
                    "21",
                ),
            );
            expect(model.controls).toEqual([]);
            expect(model.name).toBe("Reading");
            expect(model.stateLabel).toBe("21 °C");
            expect(model.primary).toBeUndefined();
        }
    });
    it("does not guess optional capabilities when feature bits are absent", () => {
        for (const domain of [
            "cover",
            "fan",
            "valve",
            "vacuum",
            "lawn_mower",
            "siren",
            "media_player",
            "water_heater",
        ])
            expect(ids(entity(domain))).toEqual([]);
        expect(ids(entity("light"))).toEqual(["power"]);
    });
    it("rejects unavailable and removed capabilities immediately before dispatch", () => {
        expect(() =>
            buildDeviceCommand(
                entity("light", {}, "unavailable"),
                "power",
                true,
            ),
        ).toThrow("unavailable");
        expect(() =>
            buildDeviceCommand(
                entity("fan", { supported_features: 0 }),
                "percentage",
                50,
            ),
        ).toThrow("not supported");
        expect(
            getDeviceModel(entity("light", {}, "unknown")).primary,
        ).toBeUndefined();
    });
    it("uses safe quick actions only for permitted domains", () => {
        expect(getDeviceModel(entity("light", {}, "off")).primary).toEqual({
            domain: "light",
            service: "turn_on",
            target: { entity_id: "light.test" },
        });
        for (const domain of [
            "lock",
            "alarm_control_panel",
            "cover",
            "valve",
            "siren",
            "button",
            "scene",
            "script",
            "automation",
            "update",
        ])
            expect(
                getDeviceModel(entity(domain, { supported_features: 65535 }))
                    .primary,
            ).toBeUndefined();
    });
});

describe("validated service payloads", () => {
    it("maps light percentage, Kelvin and RGB input to documented turn_on fields", () => {
        const light = entity("light", {
            supported_color_modes: ["hs", "color_temp"],
            min_color_temp_kelvin: 2000,
            max_color_temp_kelvin: 6500,
        });
        expect(buildDeviceCommand(light, "brightness", 42).data).toEqual({
            brightness_pct: 42,
        });
        expect(
            buildDeviceCommand(light, "color_temperature", 2700).data,
        ).toEqual({ color_temp_kelvin: 2700 });
        expect(buildDeviceCommand(light, "color", "#00ff00").data).toEqual({
            hs_color: [120, 100],
        });
        expect(() =>
            buildDeviceCommand(light, "brightness", Number.NaN),
        ).toThrow();
        expect(() => buildDeviceCommand(light, "brightness", 101)).toThrow();
        expect(() => buildDeviceCommand(light, "color", "red")).toThrow();
        expect(() => buildDeviceCommand(light, "power", "true")).toThrow();
    });
    it("constrains selectors to the latest advertised options", () => {
        const fan = entity("fan", {
            supported_features: 15,
            preset_modes: ["sleep", "auto"],
        });
        expect(buildDeviceCommand(fan, "preset", "sleep").data).toEqual({
            preset_mode: "sleep",
        });
        expect(buildDeviceCommand(fan, "oscillating", true).data).toEqual({
            oscillating: true,
        });
        expect(() => buildDeviceCommand(fan, "preset", "turbo")).toThrow(
            "available option",
        );
    });
    it("preserves the opposite climate bound and rejects inverted target ranges", () => {
        const climate = entity("climate", {
            supported_features: 2,
            min_temp: 7,
            max_temp: 35,
            target_temp_low: 18,
            target_temp_high: 24,
        });
        expect(buildDeviceCommand(climate, "target_temp_low", 20).data).toEqual(
            { target_temp_low: 20, target_temp_high: 24 },
        );
        expect(() =>
            buildDeviceCommand(climate, "target_temp_low", 25),
        ).toThrow("lower temperature");
        expect(() =>
            buildDeviceCommand(
                entity("climate", {
                    supported_features: 2,
                    min_temp: 7,
                    max_temp: 35,
                }),
                "target_temp_low",
                20,
            ),
        ).toThrow("both target temperatures");
    });
    it("uses exact media masks and structured volume/source payloads", () => {
        const media = entity("media_player", {
            supported_features: 4 | 8 | 2048,
            source_list: ["TV"],
        });
        expect(ids(media)).toEqual(["volume", "mute", "source"]);
        expect(buildDeviceCommand(media, "volume", 0.4)).toMatchObject({
            service: "volume_set",
            data: { volume_level: 0.4 },
        });
        expect(buildDeviceCommand(media, "mute", true).data).toEqual({
            is_volume_muted: true,
        });
    });
    it("targets valve and cover position services separately and requires confirmation", () => {
        for (const domain of ["cover", "valve"]) {
            const command = buildDeviceCommand(
                entity(domain, { supported_features: 4 }),
                "position",
                30,
            );
            expect(command.service).toBe(`set_${domain}_position`);
            expect(command.data).toEqual({ position: 30 });
            expect(command.confirmation).toBeTruthy();
        }
    });
    it("supports helper primitives with exact service field names", () => {
        expect(
            buildDeviceCommand(
                entity("input_number", { min: 1, max: 10, step: 1 }),
                "value",
                3,
            ).data,
        ).toEqual({ value: 3 });
        expect(
            buildDeviceCommand(
                entity("input_select", { options: ["Home"] }),
                "option",
                "Home",
            ).data,
        ).toEqual({ option: "Home" });
        expect(
            buildDeviceCommand(
                entity("input_text", { min: 2, max: 6, pattern: "[A-Z]+" }),
                "value",
                "HOME",
            ).data,
        ).toEqual({ value: "HOME" });
        expect(() =>
            buildDeviceCommand(
                entity("input_text", { pattern: "[A-Z]+" }),
                "value",
                "home",
            ),
        ).toThrow("required format");
    });
    it("validates dates and times including impossible calendar dates", () => {
        expect(
            buildDeviceCommand(entity("date"), "date", "2028-02-29").data,
        ).toEqual({ date: "2028-02-29" });
        expect(() =>
            buildDeviceCommand(entity("date"), "date", "2026-02-29"),
        ).toThrow("valid date");
        expect(() =>
            buildDeviceCommand(entity("time"), "time", "25:01"),
        ).toThrow("valid time");
        expect(
            buildDeviceCommand(
                entity("input_datetime", { has_date: true, has_time: true }),
                "datetime",
                "2026-09-06T12:30",
            ).service,
        ).toBe("set_datetime");
    });
});

describe("sensitive controls", () => {
    it("requires a transient numeric code without adding it to the model", () => {
        const lock = entity("lock", { code_format: "number" }, "locked");
        expect(() => buildDeviceCommand(lock, "unlock")).toThrow(
            "security code",
        );
        expect(() =>
            buildDeviceCommand(lock, "unlock", undefined, "abc"),
        ).toThrow("only digits");
        expect(
            buildDeviceCommand(lock, "unlock", undefined, "1234"),
        ).toMatchObject({
            data: { code: "1234" },
            confirmation: expect.any(String),
        });
        expect(JSON.stringify(getDeviceModel(lock))).not.toContain("1234");
        expect(() =>
            buildDeviceCommand(lock, "open", undefined, "1234"),
        ).toThrow("not supported");
    });
    it("honors arm-code exemption but still requires disarm code", () => {
        const alarm = entity("alarm_control_panel", {
            supported_features: 1,
            code_format: "number",
            code_arm_required: false,
        });
        expect(
            buildDeviceCommand(alarm, "alarm_arm_home").data,
        ).toBeUndefined();
        expect(() => buildDeviceCommand(alarm, "alarm_disarm")).toThrow(
            "security code",
        );
        expect(() => buildDeviceCommand(alarm, "alarm_arm_away")).toThrow(
            "not supported",
        );
    });
    it("checks lock regex codes and confirms siren option actions", () => {
        const lock = entity("lock", { code_format: "\\d{4}" });
        expect(() =>
            buildDeviceCommand(lock, "unlock", undefined, "123"),
        ).toThrow("required format");
        expect(
            buildDeviceCommand(lock, "unlock", undefined, "0123").data,
        ).toEqual({ code: "0123" });
        const siren = entity("siren", {
            supported_features: 1 | 4 | 8,
            available_tones: ["fire", "bell"],
        });
        expect(buildDeviceCommand(siren, "tone", "bell")).toMatchObject({
            service: "turn_on",
            data: { tone: "bell" },
            confirmation: expect.any(String),
        });
    });
    it("masks password values and protects consequential actions", () => {
        expect(
            getDeviceModel(entity("text", { mode: "password" }, "secret"))
                .controls[0],
        ).toMatchObject({ value: "", inputType: "password" });
        for (const [domain, id, features] of [
            ["button", "press", 0],
            ["scene", "turn_on", 0],
            ["siren", "turn_on", 1],
            ["lawn_mower", "start_mowing", 1],
            ["update", "install", 1],
        ] as const)
            expect(
                buildDeviceCommand(
                    entity(domain, { supported_features: features }),
                    id,
                ).confirmation,
            ).toBeTruthy();
        expect(
            ids(entity("update", { supported_features: 1, in_progress: true })),
        ).toEqual([]);
    });
    it("renders binary device classes as useful state labels", () => {
        expect(
            getDeviceModel(entity("binary_sensor", { device_class: "door" }))
                .stateLabel,
        ).toBe("Open");
        expect(
            getDeviceModel(
                entity("binary_sensor", { device_class: "moisture" }, "off"),
            ).stateLabel,
        ).toBe("Dry");
    });
});
