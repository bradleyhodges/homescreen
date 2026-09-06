"use client";
import { Dialog } from "@base-ui/react/dialog";
import {
    buildDeviceCommand,
    type DeviceCommand,
    type DeviceControl,
    type DeviceEntity,
    getDeviceModel,
} from "@repo/home-assistant/controls";

import { useRef, useState } from "react";
import { DeviceControlInput } from "./device-control";
import { DeviceIcon } from "./device-icon";

export interface DeviceAccessoryProps {
    entity: DeviceEntity;
    onCommand: (command: DeviceCommand) => Promise<void>;
    disabled?: boolean;
}
function focusCancel(element: HTMLButtonElement | null) {
    element?.focus();
}
/** A capability-aware tile and accessible sheet; the host owns command transport. */
export function DeviceAccessory(props: DeviceAccessoryProps) {
    return <Accessory key={props.entity.entity_id} {...props} />;
}
function Accessory({
    entity,
    onCommand,
    disabled = false,
}: DeviceAccessoryProps) {
    const model = getDeviceModel(entity);
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const busy = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<{
        control: DeviceControl;
        value?: unknown;
    } | null>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const unavailable = disabled || !model.available;
    async function execute(command: DeviceCommand) {
        if (busy.current || unavailable) return;
        busy.current = true;
        setPending(true);
        setError(null);
        try {
            await onCommand(command);
        } catch {
            setError(
                "The result couldn’t be confirmed. Check the accessory’s state before trying again.",
            );
        } finally {
            busy.current = false;
            setPending(false);
        }
    }
    function request(control: DeviceControl, value?: unknown) {
        if (unavailable || busy.current) return;
        if (control.confirmation || control.codeRequired) {
            setConfirmation({ control, value });
            return;
        }
        try {
            void execute(buildDeviceCommand(entity, control.id, value));
        } catch {
            setError(
                "This control is no longer available. Check the current device state.",
            );
        }
    }
    return (
        <>
            <article
                className="home-accessory"
                data-active={model.active && model.available}
                data-unavailable={!model.available}
                data-category={model.category}
                aria-busy={pending}
            >
                <button
                    type="button"
                    className="home-accessory-power"
                    disabled={unavailable || pending || !model.primary}
                    aria-label={
                        model.primary
                            ? `${model.primary.service === "turn_off" ? "Turn off" : "Activate"} ${model.name}`
                            : `${model.name} status`
                    }
                    onClick={() => {
                        if (model.primary) void execute(model.primary);
                    }}
                >
                    <span className="home-device-symbol">
                        {pending ? (
                            <DeviceIcon
                                domain="loading"
                                className="home-spinner"
                                aria-hidden="true"
                            />
                        ) : (
                            <DeviceIcon
                                domain={model.domain}
                                deviceClass={entity.attributes.device_class}
                            />
                        )}
                    </span>
                </button>
                <button
                    ref={trigger}
                    className="home-accessory-details"
                    type="button"
                    onClick={() => {
                        setOpen(true);
                        setError(null);
                    }}
                    aria-label={`Open ${model.name} controls`}
                >
                    <strong>{model.name}</strong>
                    <span>
                        {disabled ? "Connection interrupted" : model.stateLabel}
                    </span>
                </button>
                {error && !open && (
                    <p className="home-tile-error" role="alert">
                        {error}
                    </p>
                )}
            </article>
            <Dialog.Root
                open={open}
                onOpenChange={(value) => {
                    setOpen(value);
                    if (!value) setConfirmation(null);
                }}
            >
                <Dialog.Portal>
                    <Dialog.Backdrop className="home-sheet-backdrop" />
                    <Dialog.Popup className="home-sheet" finalFocus={trigger}>
                        <div className="home-sheet-handle" aria-hidden="true" />
                        <Dialog.Close
                            className="home-sheet-close"
                            aria-label="Close accessory controls"
                        >
                            <DeviceIcon domain="close" />
                        </Dialog.Close>
                        <header
                            className="home-sheet-header"
                            data-category={model.category}
                        >
                            <span className="home-device-symbol">
                                <DeviceIcon
                                    domain={model.domain}
                                    deviceClass={entity.attributes.device_class}
                                />
                            </span>
                            <Dialog.Title>{model.name}</Dialog.Title>
                            <Dialog.Description>
                                {model.stateLabel}
                            </Dialog.Description>
                        </header>
                        {unavailable && (
                            <p className="home-notice" role="status">
                                {disabled
                                    ? "Waiting for your Home Assistant connection. Controls will return automatically."
                                    : "This accessory is unavailable. Its controls will return when it reconnects."}
                            </p>
                        )}
                        {error && (
                            <p role="alert" className="home-control-error">
                                {error}
                            </p>
                        )}
                        {pending && (
                            <p role="status" className="home-command-status">
                                <DeviceIcon
                                    domain="loading"
                                    className="home-spinner"
                                    aria-hidden="true"
                                />
                                Sending command…
                            </p>
                        )}
                        {confirmation ? (
                            <form
                                className="home-confirmation"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const code = new FormData(
                                        event.currentTarget,
                                    ).get("code");
                                    try {
                                        const command = buildDeviceCommand(
                                            entity,
                                            confirmation.control.id,
                                            confirmation.value,
                                            typeof code === "string"
                                                ? code
                                                : undefined,
                                        );
                                        setConfirmation(null);
                                        void execute(command);
                                    } catch {
                                        setError(
                                            "Check the value or security code and try again.",
                                        );
                                    }
                                }}
                            >
                                <h3>{confirmation.control.label}</h3>
                                <p>
                                    {confirmation.control.confirmation ??
                                        "Enter your security code to continue."}
                                </p>
                                {confirmation.control.codeRequired && (
                                    <label>
                                        Security code
                                        <input
                                            name="code"
                                            type="password"
                                            required
                                            autoComplete="off"
                                        />
                                    </label>
                                )}
                                <div className="home-confirmation-actions">
                                    <button
                                        type="button"
                                        className="home-secondary-button"
                                        ref={focusCancel}
                                        onClick={() => {
                                            setConfirmation(null);
                                            setError(null);
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="home-apply"
                                        disabled={pending || unavailable}
                                    >
                                        Confirm{" "}
                                        {confirmation.control.label.toLowerCase()}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="home-sheet-controls">
                                {model.controls.map((control) => (
                                    <DeviceControlInput
                                        key={control.id}
                                        control={control}
                                        disabled={pending || unavailable}
                                        onCommit={(value) =>
                                            request(control, value)
                                        }
                                    />
                                ))}
                            </div>
                        )}
                        {!model.controls.length && (
                            <p className="home-readonly">
                                This accessory reports its state here.
                                Additional integration-specific features can be
                                added with a custom control.
                            </p>
                        )}
                        <details className="home-device-info">
                            <summary>Accessory information</summary>
                            <dl>
                                <div>
                                    <dt>Entity</dt>
                                    <dd>{entity.entity_id}</dd>
                                </div>
                                <div>
                                    <dt>Type</dt>
                                    <dd>{model.domain.replaceAll("_", " ")}</dd>
                                </div>
                                {[
                                    "device_class",
                                    "unit_of_measurement",
                                    "battery_level",
                                    "current_temperature",
                                    "current_humidity",
                                ].map((key) => {
                                    const value = entity.attributes[key];
                                    return typeof value === "string" ||
                                        typeof value === "number" ? (
                                        <div key={key}>
                                            <dt>{key.replaceAll("_", " ")}</dt>
                                            <dd>{String(value)}</dd>
                                        </div>
                                    ) : null;
                                })}
                            </dl>
                        </details>
                    </Dialog.Popup>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
}
