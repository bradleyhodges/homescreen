import type {
    DeviceCommand,
    DeviceEntity,
} from "@repo/home-assistant/controls";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DeviceAccessory } from "./device-accessory";
import { DeviceControlInput } from "./device-control";

afterEach(cleanup);

function device(
    domain = "light",
    state = "off",
    attributes: Record<string, unknown> = {},
): DeviceEntity {
    return {
        entity_id: `${domain}.test`,
        state,
        attributes: { friendly_name: "Test accessory", ...attributes },
        last_changed: "",
        last_updated: "",
        context: { id: "", parent_id: null, user_id: null },
    };
}

async function openSheet() {
    fireEvent.click(
        screen.getByRole("button", { name: "Open Test accessory controls" }),
    );
    return screen.findByRole("dialog");
}

it("preserves PIN focus during live updates and resets the sheet when the entity changes", async () => {
    const onCommand = vi.fn(async () => {});
    const entity = device("lock", "locked", { code_format: "\\d{4}" });
    const view = render(
        <DeviceAccessory entity={entity} onCommand={onCommand} />,
    );
    const dialog = await openSheet();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));
    const code = within(dialog).getByLabelText("Security code");
    code.focus();
    fireEvent.change(code, { target: { value: "1234" } });
    view.rerender(
        <DeviceAccessory
            entity={{ ...entity, last_updated: "later" }}
            onCommand={onCommand}
        />,
    );
    expect(document.activeElement).toBe(code);
    expect((code as HTMLInputElement).value).toBe("1234");
    view.rerender(
        <DeviceAccessory
            entity={{ ...entity, entity_id: "lock.another" }}
            onCommand={onCommand}
        />,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onCommand).not.toHaveBeenCalled();
});

it("sends a safe explicit power command once while pending without optimistic success", async () => {
    let finish!: () => void;
    const onCommand = vi.fn(
        (_command: DeviceCommand) =>
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
    );
    render(<DeviceAccessory entity={device()} onCommand={onCommand} />);
    const power = screen.getByRole("button", {
        name: "Activate Test accessory",
    });
    fireEvent.click(power);
    fireEvent.click(power);
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith({
        domain: "light",
        service: "turn_on",
        target: { entity_id: "light.test" },
    });
    expect((power as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Off")).toBeTruthy();
    const dialog = await openSheet();
    expect(within(dialog).getByText("Sending command…")).toBeTruthy();
    expect(
        (
            within(dialog).getByRole("switch", {
                name: "Power",
            }) as HTMLButtonElement
        ).disabled,
    ).toBe(true);
    await act(async () => finish());
    expect(
        (
            within(dialog).getByRole("switch", {
                name: "Power",
            }) as HTMLButtonElement
        ).disabled,
    ).toBe(false);
    expect(within(dialog).getByText("Off")).toBeTruthy();
});

it.each([
    true,
    false,
])("keeps disconnected/unavailable devices inspectable and disables actions (connection disabled=%s)", async (disabled) => {
    const onCommand = vi.fn(async () => {});
    render(
        <DeviceAccessory
            entity={device("light", disabled ? "off" : "unavailable")}
            onCommand={onCommand}
            disabled={disabled}
        />,
    );
    const dialog = await openSheet();
    const power = within(dialog).getByRole("switch", { name: "Power" });
    expect((power as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(power);
    expect(onCommand).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("status")).toBeTruthy();
});

it("requires confirmation and a valid transient PIN before unlocking, and cancel erases the PIN", async () => {
    const onCommand = vi.fn(async () => {});
    render(
        <DeviceAccessory
            entity={device("lock", "locked", { code_format: "\\d{4}" })}
            onCommand={onCommand}
        />,
    );
    const dialog = await openSheet();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));
    expect(onCommand).not.toHaveBeenCalled();
    const code = within(dialog).getByLabelText("Security code");
    expect((code as HTMLInputElement).type).toBe("password");
    fireEvent.change(code, { target: { value: "1234" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(within(dialog).queryByLabelText("Security code")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));
    const freshCode = within(dialog).getByLabelText("Security code");
    expect((freshCode as HTMLInputElement).value).toBe("");
    fireEvent.change(freshCode, { target: { value: "12" } });
    fireEvent.submit(freshCode.closest("form") as HTMLFormElement);
    expect(onCommand).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toBeTruthy();
    fireEvent.change(freshCode, { target: { value: "0123" } });
    fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirm unlock" }),
    );
    await waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));
    expect(onCommand).toHaveBeenCalledWith(
        expect.objectContaining({
            domain: "lock",
            service: "unlock",
            data: { code: "0123" },
            confirmation: expect.any(String),
        }),
    );
    expect(within(dialog).queryByLabelText("Security code")).toBeNull();
});

it("rechecks capabilities changed while confirmation is open", async () => {
    const onCommand = vi.fn(async () => {});
    const view = render(
        <DeviceAccessory
            entity={device("cover", "closed", { supported_features: 1 })}
            onCommand={onCommand}
        />,
    );
    const dialog = await openSheet();
    fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));
    view.rerender(
        <DeviceAccessory
            entity={device("cover", "closed", { supported_features: 0 })}
            onCommand={onCommand}
        />,
    );
    fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirm open" }),
    );
    expect(onCommand).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toBeTruthy();
});

it("reports transport failure without exposing its sensitive error or retrying", async () => {
    const onCommand = vi.fn(async () => {
        throw new Error("secret-token-example");
    });
    render(<DeviceAccessory entity={device()} onCommand={onCommand} />);
    fireEvent.click(
        screen.getByRole("button", { name: "Activate Test accessory" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("couldn’t be confirmed");
    expect(document.body.textContent).not.toContain("secret-token-example");
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(
        (
            screen.getByRole("button", {
                name: "Activate Test accessory",
            }) as HTMLButtonElement
        ).disabled,
    ).toBe(false);
});

it("Escape closes confirmation without dispatch and restores focus to the details button", async () => {
    const onCommand = vi.fn(async () => {});
    render(<DeviceAccessory entity={device("button")} onCommand={onCommand} />);
    const trigger = screen.getByRole("button", {
        name: "Open Test accessory controls",
    });
    trigger.focus();
    const dialog = await openSheet();
    fireEvent.click(within(dialog).getByRole("button", { name: "Press" }));
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(onCommand).not.toHaveBeenCalled();
});

it("keeps text edits local until Apply and labels its input", () => {
    const onCommit = vi.fn();
    render(
        <DeviceControlInput
            control={{
                id: "value",
                label: "Message",
                kind: "text",
                value: "Hello",
            }}
            disabled={false}
            onCommit={onCommit}
        />,
    );
    const input = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(input, { target: { value: "Good evening" } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onCommit).toHaveBeenCalledWith("Good evening");
});

it("exposes an accessible keyboard slider and dispatches one committed value", () => {
    const onCommit = vi.fn();
    render(
        <DeviceControlInput
            control={{
                id: "brightness",
                label: "Brightness",
                kind: "range",
                value: 50,
                min: 0,
                max: 100,
                step: 1,
                unit: "%",
            }}
            disabled={false}
            onCommit={onCommit}
        />,
    );
    const slider = screen.getByRole("slider", { name: "Brightness" });
    expect(slider.getAttribute("aria-valuenow")).toBe("50");
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(51);
});
