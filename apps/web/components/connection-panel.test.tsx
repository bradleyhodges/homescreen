import { useHass } from "@repo/home-assistant/hooks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionPanel } from "./connection-panel";

vi.mock("@repo/home-assistant/hooks", () => ({
    useHass: vi.fn(),
    useEntities: () => ({}),
}));

let state: ReturnType<typeof useHass>;
beforeEach(() => {
    state = {
        status: "disconnected",
        error: null,
        instanceUrl: null,
        connect: vi.fn().mockResolvedValue(undefined),
        retry: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        logout: vi.fn().mockResolvedValue(undefined),
        callService: vi.fn(),
    };
    vi.mocked(useHass).mockImplementation(() => state);
});
afterEach(cleanup);

describe("connection screen", () => {
    it("submits the instance URL using the form's keyboard-compatible submit action", () => {
        render(<ConnectionPanel />);
        const input = screen.getByLabelText("Instance URL");
        fireEvent.change(input, {
            target: { value: "https://ha.example.test" },
        });
        fireEvent.submit(input.closest("form")!);
        expect(state.connect).toHaveBeenCalledWith("https://ha.example.test");
    });

    it("prevents duplicate connects while keeping cancellation available", () => {
        state.status = "connecting";
        render(<ConnectionPanel />);
        expect(
            screen.getByLabelText("Instance URL").hasAttribute("disabled"),
        ).toBe(true);
        expect(
            screen
                .getByRole("button", { name: "Connecting…" })
                .hasAttribute("disabled"),
        ).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(state.disconnect).toHaveBeenCalledOnce();
    });

    it("shows an authentication error and offers retry and logout", () => {
        state.status = "error";
        state.instanceUrl = "https://ha.example.test";
        state.error = "Home Assistant rejected your credentials.";
        render(<ConnectionPanel />);
        expect(screen.getByRole("alert").textContent).toContain(state.error);
        fireEvent.click(
            screen.getByRole("button", { name: "Retry connection" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Log out" }));
        expect(state.retry).toHaveBeenCalledOnce();
        expect(state.logout).toHaveBeenCalledOnce();
    });
});
