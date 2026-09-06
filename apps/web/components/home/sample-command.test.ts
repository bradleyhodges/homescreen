import {
    buildDeviceCommand,
    getDeviceModel,
} from "@repo/home-assistant/controls";
import { expect, it } from "vitest";
import { applySampleCommand } from "./sample-command";
import { createSampleEntities, SAMPLE_HOME } from "./sample-home";

it("changes only the targeted sample device and preserves unrelated references", () => {
    const entities = createSampleEntities();
    const entity = entities["light.floor_lamp"];
    if (!entity) throw new Error("Sample lamp is missing.");
    const next = applySampleCommand(
        entities,
        buildDeviceCommand(entity, "brightness", 50),
    );
    expect(next[entity.entity_id]?.attributes.brightness).toBe(128);
    expect(entities[entity.entity_id]?.attributes.brightness).toBe(191);
    expect(next["light.bookshelf"]).toBe(entities["light.bookshelf"]);
});

it("rejects targets outside the sample home and does not retain security codes", () => {
    const entities = createSampleEntities();
    expect(() =>
        applySampleCommand(entities, {
            domain: "light",
            service: "turn_on",
            target: { entity_id: "light.real_device" },
        }),
    ).toThrow("sample home");
    const alarm = entities["alarm_control_panel.home"];
    if (!alarm) throw new Error("Sample alarm is missing.");
    const next = applySampleCommand(
        entities,
        buildDeviceCommand(alarm, "alarm_arm_home", undefined, "1234"),
    );
    expect(next[alarm.entity_id]?.state).toBe("armed_home");
    expect(JSON.stringify(next)).not.toContain("1234");
});

it("simulates every control advertised by the sample catalog", () => {
    const entities = createSampleEntities();
    for (const { entity } of SAMPLE_HOME) {
        if (!getDeviceModel(entity).available) continue;
        for (const control of getDeviceModel(entity).controls) {
            const value =
                control.kind === "action"
                    ? undefined
                    : control.kind === "select"
                      ? control.options[0]?.value
                      : control.value;
            const command = buildDeviceCommand(
                entity,
                control.id,
                value,
                control.codeRequired ? "1234" : undefined,
            );
            expect(
                () => applySampleCommand(entities, command),
                `${entity.entity_id}: ${control.id}`,
            ).not.toThrow();
        }
    }
});

it("provides only preview-safe media fixtures without token or image URLs", () => {
    for (const { entity } of SAMPLE_HOME) {
        expect(entity.attributes).not.toHaveProperty("access_token");
        expect(entity.attributes).not.toHaveProperty("entity_picture");
        expect(entity.attributes).not.toHaveProperty("image_url");
    }
});
