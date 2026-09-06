import type {
    Connection,
    Context,
    HassEntities,
    HassEntity,
} from "home-assistant-js-websocket";
import { withTimeout } from "./timeout";

function record(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("Invalid entity update");
    return value as Record<string, unknown>;
}
function timestamp(value: unknown): string {
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error("Invalid entity timestamp");
    return new Date(value * 1000).toISOString();
}
function context(value: unknown, previous?: Context): Context {
    if (typeof value === "string")
        return {
            id: value,
            parent_id: previous?.parent_id ?? null,
            user_id: previous?.user_id ?? null,
        };
    const fields = record(value);
    const result = { ...previous, ...fields };
    if (
        typeof result.id !== "string" ||
        !(result.parent_id === null || typeof result.parent_id === "string") ||
        !(result.user_id === null || typeof result.user_id === "string")
    )
        throw new Error("Invalid entity context");
    return {
        id: result.id,
        parent_id: result.parent_id,
        user_id: result.user_id,
    };
}
function entityId(value: string) {
    if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(value))
        throw new Error("Invalid entity ID");
}

/** Decode HA's compressed entity protocol, replacing the first snapshot of every subscription. */
export function applyEntityUpdates(
    previous: HassEntities,
    value: unknown,
    initial: boolean,
): HassEntities {
    const update = record(value);
    const entities: HassEntities = initial ? {} : { ...previous };
    if (update.a !== undefined) {
        for (const [id, value] of Object.entries(record(update.a))) {
            entityId(id);
            const compressed = record(value);
            if (typeof compressed.s !== "string")
                throw new Error("Invalid entity state");
            const changed = timestamp(compressed.lc);
            entities[id] = {
                entity_id: id,
                state: compressed.s,
                attributes: record(compressed.a),
                context: context(compressed.c),
                last_changed: changed,
                last_updated:
                    compressed.lu === undefined
                        ? changed
                        : timestamp(compressed.lu),
            };
        }
    }
    if (update.r !== undefined) {
        if (!Array.isArray(update.r))
            throw new Error("Invalid entity removals");
        for (const id of update.r) {
            if (typeof id !== "string") throw new Error("Invalid entity ID");
            entityId(id);
            delete entities[id];
        }
    }
    if (update.c !== undefined) {
        for (const [id, value] of Object.entries(record(update.c))) {
            entityId(id);
            const previousEntity = entities[id];
            if (!previousEntity) throw new Error("Update for unknown entity");
            const delta = record(value);
            const plus = delta["+"] === undefined ? {} : record(delta["+"]);
            const minus = delta["-"] === undefined ? {} : record(delta["-"]);
            const next: HassEntity = { ...previousEntity };
            if (plus.s !== undefined) {
                if (typeof plus.s !== "string")
                    throw new Error("Invalid entity state");
                next.state = plus.s;
            }
            if (plus.c !== undefined)
                next.context = context(plus.c, previousEntity.context);
            if (plus.lc !== undefined) {
                next.last_changed = timestamp(plus.lc);
                next.last_updated = next.last_changed;
            } else if (plus.lu !== undefined)
                next.last_updated = timestamp(plus.lu);
            if (plus.a !== undefined || minus.a !== undefined) {
                next.attributes = {
                    ...previousEntity.attributes,
                    ...(plus.a === undefined ? {} : record(plus.a)),
                };
                if (minus.a !== undefined) {
                    if (
                        !Array.isArray(minus.a) ||
                        !minus.a.every((key) => typeof key === "string")
                    )
                        throw new Error("Invalid attribute removals");
                    for (const key of minus.a as string[])
                        delete next.attributes[key];
                }
            }
            entities[id] = next;
        }
    }
    return entities;
}

/** Keep the optimized SDK subscription protocol, with observable failures and fresh reconnect snapshots. */
export function subscribeEntityStream(
    connection: Connection,
    onChange: (entities: HassEntities) => void,
    onError: () => void,
): () => void {
    let stopped = false;
    let epoch = 0;
    let disposeSubscription: (() => void) | undefined;
    function invalidate() {
        epoch += 1;
        disposeSubscription?.();
        disposeSubscription = undefined;
    }
    function subscribe() {
        invalidate();
        const current = epoch;
        const socket = connection.socket;
        let initial = true;
        let entities: HassEntities = {};
        const isCurrent = () => !stopped && epoch === current;
        const subscription = connection.subscribeMessage<unknown>(
            (value) => {
                if (!isCurrent()) return;
                try {
                    entities = applyEntityUpdates(entities, value, initial);
                    initial = false;
                    onChange(entities);
                } catch {
                    onError();
                }
            },
            { type: "subscribe_entities" },
            { resubscribe: false },
        );
        void withTimeout(
            subscription.then((unsubscribe) => {
                const dispose = () => {
                    // IDs restart on reconnect. Never unsubscribe an old ID from a new socket.
                    if (connection.connected && connection.socket === socket)
                        void withTimeout(unsubscribe()).catch(() => {
                            if (isCurrent()) onError();
                        });
                };
                if (isCurrent()) disposeSubscription = dispose;
                else dispose();
            }),
        ).catch(() => {
            if (isCurrent()) onError();
        });
    }
    connection.addEventListener("ready", subscribe);
    connection.addEventListener("disconnected", invalidate);
    subscribe();
    return () => {
        stopped = true;
        invalidate();
        connection.removeEventListener("ready", subscribe);
        connection.removeEventListener("disconnected", invalidate);
    };
}
