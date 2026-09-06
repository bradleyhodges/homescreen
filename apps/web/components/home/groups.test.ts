import {
    EMPTY_REGISTRY,
    type RegistryState,
} from "@repo/home-assistant/registry";
import { expect, it } from "vitest";
import { groupEntityIds, inCategory } from "./groups";

it("groups explicit and inherited rooms before domain fallbacks, omitting hidden devices", () => {
    const registry: RegistryState = {
        ...EMPTY_REGISTRY,
        areas: [
            { area_id: "kitchen", name: "Kitchen" },
            { area_id: "bedroom", name: "Bedroom" },
        ],
        devices: { lamp: { id: "lamp", area_id: "kitchen" } },
        entities: {
            "light.explicit": {
                entity_id: "light.explicit",
                area_id: "bedroom",
                device_id: "lamp",
                hidden_by: null,
                disabled_by: null,
            },
            "light.inherited": {
                entity_id: "light.inherited",
                area_id: null,
                device_id: "lamp",
                hidden_by: null,
                disabled_by: null,
            },
            "light.hidden": {
                entity_id: "light.hidden",
                area_id: "bedroom",
                device_id: null,
                hidden_by: "user",
                disabled_by: null,
            },
        },
    };
    expect(
        groupEntityIds(
            [
                "light.explicit",
                "light.inherited",
                "light.hidden",
                "sensor.outside",
            ],
            registry,
        ),
    ).toEqual([
        { id: "area:bedroom", name: "Bedroom", entityIds: ["light.explicit"] },
        { id: "area:kitchen", name: "Kitchen", entityIds: ["light.inherited"] },
        { id: "domain:sensor", name: "Sensors", entityIds: ["sensor.outside"] },
    ]);
});

it("matches categories by exact domain rather than names that happen to contain one", () => {
    expect(inCategory("light.desk", "lighting")).toBe(true);
    expect(inCategory("sensor.light_level", "lighting")).toBe(false);
    expect(inCategory("unknown.accessory", "all")).toBe(true);
});
