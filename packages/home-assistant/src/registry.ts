import type { Connection } from "home-assistant-js-websocket";
import { withTimeout } from "./timeout";

export interface RegistryArea {
    area_id: string;
    name: string;
}
export interface RegistryDevice {
    id: string;
    area_id: string | null;
}
export interface RegistryEntity {
    entity_id: string;
    area_id: string | null;
    device_id: string | null;
    hidden_by: string | null;
    disabled_by: string | null;
}
export interface RegistryState {
    areas: readonly RegistryArea[];
    devices: Readonly<Record<string, RegistryDevice>>;
    entities: Readonly<Record<string, RegistryEntity>>;
    status: "idle" | "loading" | "ready" | "error";
    error: string | null;
}
export const EMPTY_REGISTRY: RegistryState = {
    areas: [],
    devices: {},
    entities: {},
    status: "idle",
    error: null,
};

function rows(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new Error("Invalid registry response.");
    return value.map((row: unknown) => {
        if (typeof row !== "object" || row === null || Array.isArray(row))
            throw new Error("Invalid registry entry.");
        return row as Record<string, unknown>;
    });
}
function required(value: unknown): string {
    if (typeof value !== "string" || !value)
        throw new Error("Invalid registry field.");
    return value;
}
function optional(value: unknown): string | null {
    return value == null ? null : required(value);
}

/** Resolve an entity's explicit room before its device's inherited room. */
export function getEntityArea(
    registry: RegistryState,
    entityId: string,
): RegistryArea | undefined {
    const entity = registry.entities[entityId];
    const areaId =
        entity?.area_id ??
        (entity?.device_id
            ? registry.devices[entity.device_id]?.area_id
            : null);
    return registry.areas.find((area) => area.area_id === areaId);
}

/** Unregistered entities remain usable; registry-hidden and disabled entries stay out of dashboards. */
export function isEntityVisible(
    registry: RegistryState,
    entityId: string,
): boolean {
    const entry = registry.entities[entityId];
    return !entry?.hidden_by && !entry?.disabled_by;
}

/** Optional metadata never owns or interrupts the main entity connection. */
export function subscribeRegistry(
    connection: Connection,
    onChange: (state: RegistryState) => void,
): () => void {
    let stopped = false;
    let epoch = 0;
    let running = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let state: RegistryState = { ...EMPTY_REGISTRY, status: "loading" };
    const subscriptions: (() => Promise<void>)[] = [];
    let subscriptionFailed = false;
    const reportError = () => {
        if (stopped) return;
        state = {
            ...state,
            status: "error",
            error: "Room information is unavailable. Devices are still available by type.",
        };
        onChange(state);
    };
    const dispose = (unsubscribe: () => Promise<void>) => {
        void withTimeout(unsubscribe()).catch(() => {
            if (!stopped) reportError();
        });
    };
    async function refresh() {
        if (stopped || !connection.connected) return;
        if (running) {
            dirty = true;
            return;
        }
        running = true;
        const current = epoch;
        try {
            const [areas, devices, entities] = await withTimeout(
                Promise.all([
                    connection.sendMessagePromise<unknown>({
                        type: "config/area_registry/list",
                    }),
                    connection.sendMessagePromise<unknown>({
                        type: "config/device_registry/list",
                    }),
                    connection.sendMessagePromise<unknown>({
                        type: "config/entity_registry/list",
                    }),
                ]),
            );
            if (stopped || current !== epoch) return;
            state = {
                areas: rows(areas).map((row) => ({
                    area_id: required(row.area_id),
                    name: required(row.name),
                })),
                devices: Object.fromEntries(
                    rows(devices).map((row) => {
                        const id = required(row.id);
                        return [id, { id, area_id: optional(row.area_id) }];
                    }),
                ),
                entities: Object.fromEntries(
                    rows(entities).map((row) => {
                        const entity_id = required(row.entity_id);
                        return [
                            entity_id,
                            {
                                entity_id,
                                area_id: optional(row.area_id),
                                device_id: optional(row.device_id),
                                hidden_by: optional(row.hidden_by),
                                disabled_by: optional(row.disabled_by),
                            },
                        ];
                    }),
                ),
                status: "ready",
                error: null,
            };
            if (subscriptionFailed) reportError();
            else onChange(state);
        } catch {
            if (!stopped && current === epoch) reportError();
        } finally {
            if (current === epoch) {
                running = false;
                if (dirty) {
                    dirty = false;
                    schedule();
                }
            }
        }
    }
    function schedule() {
        if (stopped || !connection.connected) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            void refresh();
        }, 250);
    }
    function invalidate() {
        epoch += 1;
        running = false;
        dirty = false;
        clearTimeout(timer);
    }
    function ready() {
        invalidate();
        void refresh();
    }
    // subscribeEvents keeps one subscription across SDK reconnects; only snapshots need refreshing.
    const registrations = ["area", "device", "entity"].map((type) => {
        let expired = false;
        return withTimeout(
            Promise.resolve()
                .then(() =>
                    stopped
                        ? undefined
                        : connection.subscribeEvents(
                              schedule,
                              `${type}_registry_updated`,
                          ),
                )
                .then((unsubscribe) => {
                    if (!unsubscribe) return;
                    if (stopped || expired) dispose(unsubscribe);
                    else subscriptions.push(unsubscribe);
                }),
        ).catch(() => {
            expired = true;
            subscriptionFailed = true;
            reportError();
        });
    });
    connection.addEventListener("ready", ready);
    connection.addEventListener("disconnected", invalidate);
    onChange(state);
    // Establish updates before reading the initial snapshot, avoiding a missed change window.
    void Promise.all(registrations).then(() => refresh());
    return () => {
        if (stopped) return;
        stopped = true;
        invalidate();
        connection.removeEventListener("ready", ready);
        connection.removeEventListener("disconnected", invalidate);
        for (const unsubscribe of subscriptions) dispose(unsubscribe);
    };
}
