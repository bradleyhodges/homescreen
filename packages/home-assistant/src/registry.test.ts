import type { Connection } from "home-assistant-js-websocket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    EMPTY_REGISTRY,
    getEntityArea,
    isEntityVisible,
    type RegistryState,
    subscribeRegistry,
} from "./registry";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
function fixture() {
    const events = new Map<string, () => void>();
    const updates = new Map<string, () => void>();
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const connection = {
        connected: true,
        sendMessagePromise: vi.fn(async ({ type }: { type: string }) => {
            if (type === "config/area_registry/list")
                return [{ area_id: "kitchen", name: "Kitchen" }];
            if (type === "config/device_registry/list")
                return [{ id: "lamp", area_id: "kitchen" }];
            return [
                {
                    entity_id: "light.lamp",
                    area_id: null,
                    device_id: "lamp",
                    hidden_by: null,
                    disabled_by: null,
                },
            ];
        }),
        subscribeEvents: vi.fn(async (callback: () => void, type: string) => {
            updates.set(type, callback);
            return unsubscribe;
        }),
        addEventListener: vi.fn((type: string, callback: () => void) => {
            events.set(type, callback);
        }),
        removeEventListener: vi.fn((type: string) => {
            events.delete(type);
        }),
    };
    const onChange = vi.fn<(state: RegistryState) => void>();
    const stop = subscribeRegistry(
        connection as unknown as Connection,
        onChange,
    );
    const latest = () => onChange.mock.lastCall?.[0] ?? EMPTY_REGISTRY;
    return { connection, events, updates, unsubscribe, stop, onChange, latest };
}
beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe("optional room registry", () => {
    it("maps inherited rooms and debounces update bursts", async () => {
        const f = fixture();
        await vi.advanceTimersByTimeAsync(0);
        expect(f.latest().status).toBe("ready");
        expect(getEntityArea(f.latest(), "light.lamp")?.name).toBe("Kitchen");
        expect(f.connection.sendMessagePromise).toHaveBeenCalledTimes(3);
        f.updates.get("entity_registry_updated")?.();
        f.updates.get("device_registry_updated")?.();
        f.updates.get("area_registry_updated")?.();
        await vi.advanceTimersByTimeAsync(249);
        expect(f.connection.sendMessagePromise).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(1);
        expect(f.connection.sendMessagePromise).toHaveBeenCalledTimes(6);
        f.stop();
    });
    it("refreshes after reconnect and ignores old socket results", async () => {
        const f = fixture();
        const pending = deferred<never[]>();
        f.connection.sendMessagePromise.mockImplementationOnce(
            () => pending.promise,
        );
        await vi.advanceTimersByTimeAsync(0);
        f.connection.connected = false;
        f.events.get("disconnected")?.();
        f.connection.connected = true;
        f.events.get("ready")?.();
        await vi.advanceTimersByTimeAsync(0);
        expect(f.latest().areas).toHaveLength(1);
        const calls = f.onChange.mock.calls.length;
        pending.resolve([]);
        await vi.advanceTimersByTimeAsync(0);
        expect(f.onChange).toHaveBeenCalledTimes(calls);
        expect(f.connection.subscribeEvents).toHaveBeenCalledTimes(3);
        f.stop();
    });
    it("deduplicates in-flight refreshes and catches up once after updates", async () => {
        const f = fixture();
        await vi.advanceTimersByTimeAsync(0);
        const pending = deferred<never[]>();
        f.connection.sendMessagePromise.mockImplementationOnce(
            () => pending.promise,
        );
        f.updates.get("area_registry_updated")?.();
        await vi.advanceTimersByTimeAsync(250);
        f.updates.get("entity_registry_updated")?.();
        await vi.advanceTimersByTimeAsync(250);
        expect(f.connection.sendMessagePromise).toHaveBeenCalledTimes(6);
        pending.resolve([]);
        await vi.advanceTimersByTimeAsync(250);
        expect(f.connection.sendMessagePromise).toHaveBeenCalledTimes(9);
        f.stop();
    });
    it("tears down timers, subscriptions and stale callbacks", async () => {
        const f = fixture();
        await vi.advanceTimersByTimeAsync(0);
        f.updates.get("area_registry_updated")?.();
        f.stop();
        await vi.advanceTimersByTimeAsync(500);
        expect(f.unsubscribe).toHaveBeenCalledTimes(3);
        expect(f.events.size).toBe(0);
        expect(f.connection.sendMessagePromise).toHaveBeenCalledTimes(3);
        f.updates.get("entity_registry_updated")?.();
        await vi.advanceTimersByTimeAsync(500);
        expect(f.connection.sendMessagePromise).toHaveBeenCalledTimes(3);
    });
    it("bounds unavailable metadata and disposes late subscriptions", async () => {
        const f = fixture();
        const pending = deferred<typeof f.unsubscribe>();
        f.connection.subscribeEvents.mockImplementationOnce(
            () => pending.promise,
        );
        await vi.advanceTimersByTimeAsync(30_000);
        expect(f.latest().status).toBe("error");
        expect(f.latest().error).toContain("Devices are still available");
        f.stop();
        const lateUnsubscribe = vi.fn().mockResolvedValue(undefined);
        pending.resolve(lateUnsubscribe);
        await vi.advanceTimersByTimeAsync(0);
        expect(lateUnsubscribe).toHaveBeenCalledOnce();
    });
    it("handles rejected requests and malformed metadata without throwing", async () => {
        const f = fixture();
        f.connection.sendMessagePromise.mockRejectedValueOnce(
            new Error("not allowed"),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(f.latest().status).toBe("error");
        f.connection.sendMessagePromise.mockResolvedValueOnce([{}] as never[]);
        f.events.get("ready")?.();
        await vi.advanceTimersByTimeAsync(0);
        expect(f.latest().status).toBe("error");
        f.stop();
    });
    it("honors explicit entity rooms and visibility with unregistered fallback", () => {
        const registry: RegistryState = {
            ...EMPTY_REGISTRY,
            areas: [
                { area_id: "office", name: "Office" },
                { area_id: "kitchen", name: "Kitchen" },
            ],
            devices: { lamp: { id: "lamp", area_id: "kitchen" } },
            entities: {
                "light.lamp": {
                    entity_id: "light.lamp",
                    area_id: "office",
                    device_id: "lamp",
                    hidden_by: "user",
                    disabled_by: null,
                },
            },
        };
        expect(getEntityArea(registry, "light.lamp")?.name).toBe("Office");
        expect(isEntityVisible(registry, "light.lamp")).toBe(false);
        expect(isEntityVisible(registry, "sensor.unregistered")).toBe(true);
        expect(getEntityArea(registry, "sensor.unregistered")).toBeUndefined();
    });
});
