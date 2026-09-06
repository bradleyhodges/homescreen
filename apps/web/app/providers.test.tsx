import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ path: "/preview", mounted: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@repo/home-assistant/provider", () => ({
    HassProvider: ({ children }: { children: ReactNode }) => {
        state.mounted();
        return <div data-testid="hass-provider">{children}</div>;
    },
}));

import { Providers } from "./providers";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});
it("never mounts the live connection provider on the sample route", () => {
    state.path = "/preview";
    render(
        <Providers>
            <p>Sample</p>
        </Providers>,
    );
    expect(screen.getByText("Sample")).toBeTruthy();
    expect(state.mounted).not.toHaveBeenCalled();
});
it("removes the live provider when entering the sample home", () => {
    state.path = "/";
    const view = render(
        <Providers>
            <p>Home</p>
        </Providers>,
    );
    expect(screen.getByTestId("hass-provider")).toBeTruthy();
    state.path = "/preview";
    view.rerender(
        <Providers>
            <p>Sample</p>
        </Providers>,
    );
    expect(screen.queryByTestId("hass-provider")).toBeNull();
});
