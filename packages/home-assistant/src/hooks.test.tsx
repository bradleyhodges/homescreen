import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useDomain, useEntity, useHass } from "./hooks";
import { HassProvider } from "./provider";
import { TOKEN_KEY } from "./storage";

const sdk = vi.hoisted(() => ({
    getAuth: vi.fn(),
    createConnection: vi.fn(),
    subscribeEntities: vi.fn(),
    callService: vi.fn(),
}));
vi.mock("./entities", () => ({ subscribeEntityStream: sdk.subscribeEntities }));
vi.mock("home-assistant-js-websocket", () => ({
    ...sdk,
    ERR_INVALID_AUTH: 2,
    ERR_INVALID_AUTH_CALLBACK: 6,
}));
afterEach(() => {
    cleanup();
    sessionStorage.removeItem(TOKEN_KEY);
});

it("keeps entity/domain/control consumers stable for unrelated updates under StrictMode", async () => {
    const entity = (id: string, state = "off"): HassEntity => ({
        entity_id: id,
        state,
        attributes: {},
        last_changed: "",
        last_updated: "",
        context: { id: "", user_id: null, parent_id: null },
    });
    const light = entity("light.desk");
    const sensor = entity("sensor.temp", "21");
    let emit!: (entities: HassEntities) => void;
    const close = vi.fn();
    sdk.getAuth.mockResolvedValue({});
    sdk.createConnection.mockResolvedValue({
        connected: true,
        close,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    sdk.subscribeEntities.mockImplementation(
        (_connection: unknown, callback: typeof emit) => {
            emit = callback;
            callback({ "light.desk": light, "sensor.temp": sensor });
            return vi.fn();
        },
    );
    sessionStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({
            hassUrl: "http://home.local:8123",
            clientId: `${location.origin}/`,
            access_token: "test",
            refresh_token: "test",
            expires: 1,
            expires_in: 1800,
        }),
    );
    const renders = { entity: 0, domain: 0, controls: 0 };
    function Entity() {
        useEntity("light.desk");
        renders.entity += 1;
        return null;
    }
    function Domain() {
        useDomain("light");
        renders.domain += 1;
        return null;
    }
    function Controls() {
        const { status } = useHass();
        renders.controls += 1;
        return <span>{status}</span>;
    }
    const view = render(
        <StrictMode>
            <HassProvider>
                <Entity />
                <Domain />
                <Controls />
            </HassProvider>
        </StrictMode>,
    );
    await waitFor(() => expect(view.getByText("connected")).toBeTruthy());
    const before = { ...renders };
    act(() =>
        emit({
            "light.desk": light,
            "sensor.temp": entity("sensor.temp", "22"),
        }),
    );
    expect(renders).toEqual(before);
    act(() =>
        emit({
            "light.desk": entity("light.desk", "on"),
            "sensor.temp": sensor,
        }),
    );
    expect(renders.entity).toBeGreaterThan(before.entity);
    expect(renders.domain).toBeGreaterThan(before.domain);
    expect(renders.controls).toBe(before.controls);
    view.unmount();
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
    expect(sdk.getAuth).toHaveBeenCalledOnce();
});
