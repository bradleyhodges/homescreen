import {
    getEntityArea,
    isEntityVisible,
    type RegistryState,
} from "@repo/home-assistant/registry";

export interface HomeGroup {
    id: string;
    name: string;
    entityIds: string[];
}

const domainNames: Record<string, string> = {
    light: "Lights",
    switch: "Switches",
    climate: "Climate",
    fan: "Fans",
    sensor: "Sensors",
    binary_sensor: "Sensors",
    media_player: "Entertainment",
    cover: "Shades & covers",
    lock: "Locks",
    camera: "Cameras",
    vacuum: "Cleaning",
    scene: "Scenes",
    automation: "Automations",
    script: "Scripts",
    alarm_control_panel: "Security",
};

export const categories = [
    { id: "all", name: "All accessories" },
    { id: "lighting", name: "Lighting" },
    { id: "climate", name: "Climate" },
    { id: "security", name: "Security" },
    { id: "media", name: "Entertainment" },
] as const;
export type HomeCategory = (typeof categories)[number]["id"];

export function inCategory(entityId: string, category: HomeCategory): boolean {
    const domain = entityId.split(".")[0] ?? "";
    if (category === "all") return true;
    const domains: Record<Exclude<HomeCategory, "all">, readonly string[]> = {
        lighting: ["light"],
        climate: ["climate", "fan", "humidifier", "water_heater"],
        security: [
            "lock",
            "alarm_control_panel",
            "camera",
            "siren",
            "binary_sensor",
            "cover",
        ],
        media: ["media_player", "remote"],
    };
    return domains[category].includes(domain);
}

/** Real room assignments take precedence; unassigned devices are grouped by domain. */
export function groupEntityIds(
    ids: readonly string[],
    registry: RegistryState,
): HomeGroup[] {
    const groups = new Map<string, HomeGroup>();
    for (const id of ids) {
        if (!isEntityVisible(registry, id)) continue;
        const area = getEntityArea(registry, id);
        const domain = id.split(".")[0] ?? "other";
        const key = area ? `area:${area.area_id}` : `domain:${domain}`;
        let group = groups.get(key);
        if (!group) {
            const name =
                domainNames[domain] ??
                domain
                    .replaceAll("_", " ")
                    .replace(/^./, (letter) => letter.toUpperCase());
            group = { id: key, name: area?.name ?? name, entityIds: [] };
            groups.set(key, group);
        }
        group.entityIds.push(id);
    }
    return [...groups.values()].sort((a, b) => {
        if (a.id.startsWith("area:") !== b.id.startsWith("area:"))
            return a.id.startsWith("area:") ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}
