import { EMPTY_REGISTRY } from "@repo/home-assistant/registry";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeEntry } from "./home-entry";

const state = vi.hoisted(() => ({
    status: "disconnected",
    ids: [] as string[],
    logout: vi.fn(),
    callService: vi.fn(),
}));
vi.mock("@repo/home-assistant/hooks", () => ({
    useHass: () => ({
        status: state.status,
        logout: state.logout,
        callService: state.callService,
    }),
    useEntityIds: () => state.ids,
    useEntity: (id: string) => ({ entity_id: id, state: "on", attributes: {} }),
    useQuery: () => [],
    useRegistry: () => EMPTY_REGISTRY,
}));
vi.mock("@repo/components/home/device-accessory", () => ({
    DeviceAccessory: ({
        entity,
        disabled,
    }: {
        entity: { entity_id: string };
        disabled?: boolean;
    }) => (
        <button type="button" data-testid="accessory" disabled={disabled}>
            {entity.entity_id}
        </button>
    ),
}));
vi.mock("@repo/components/home/device-icon", () => ({
    DeviceIcon: () => <span />,
}));
vi.mock("../connection-panel", () => ({
    ConnectionPanel: () => <p>Connection form</p>,
}));
beforeEach(() => {
    state.status = "disconnected";
    state.ids = [];
});
afterEach(cleanup);

it("shows connection setup with a sample-home link while disconnected", () => {
    render(React.createElement(HomeEntry));
    expect(screen.getByText("Connection form")).toBeTruthy();
    expect(
        screen
            .getByRole("link", { name: /Explore the sample home/ })
            .getAttribute("href"),
    ).toBe("/preview");
});

it("mounts at most 60 live accessories initially and loads more on request", () => {
    state.status = "connected";
    state.ids = Array.from(
        { length: 75 },
        (_, index) => `light.sample_${index}`,
    );
    render(<HomeEntry />);
    expect(screen.getAllByTestId("accessory")).toHaveLength(60);
    fireEvent.click(
        screen.getByRole("button", { name: "Show more accessories" }),
    );
    expect(screen.getAllByTestId("accessory")).toHaveLength(75);
    fireEvent.click(screen.getByRole("button", { name: "Lighting" }));
    expect(screen.getAllByTestId("accessory")).toHaveLength(60);
});

it("keeps accessories visible but disables commands while reconnecting", () => {
    state.status = "reconnecting";
    state.ids = ["light.sample"];
    render(<HomeEntry />);
    expect(
        (screen.getByTestId("accessory") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Reconnecting");
    fireEvent.click(screen.getByRole("button", { name: /Log out/ }));
    expect(state.logout).toHaveBeenCalled();
});
