"use client";
import { Slider } from "@base-ui/react/slider";
import type { DeviceControl } from "@repo/home-assistant/controls";
import { useId, useState } from "react";

export interface DeviceControlProps {
    control: DeviceControl;
    disabled: boolean;
    onCommit: (value?: unknown) => void;
}
/** Input changes stay local until the user explicitly commits them. */
export function DeviceControlInput({
    control,
    disabled,
    onCommit,
}: DeviceControlProps) {
    const id = useId();
    if (control.kind === "range")
        return (
            <RangeControl
                control={control}
                disabled={disabled}
                onCommit={onCommit}
            />
        );
    if (control.kind === "action")
        return (
            <button
                className="home-control-action"
                disabled={disabled}
                onClick={() => onCommit()}
                type="button"
            >
                {control.label}
                <span aria-hidden="true">›</span>
            </button>
        );
    if (control.kind === "toggle")
        return (
            <div className="home-control-row">
                <span id={id}>{control.label}</span>
                <button
                    type="button"
                    className="home-switch"
                    role="switch"
                    aria-labelledby={id}
                    aria-checked={control.value}
                    disabled={disabled}
                    onClick={() => onCommit(!control.value)}
                >
                    <span />
                </button>
            </div>
        );
    if (control.kind === "select")
        return (
            <label className="home-control-row" htmlFor={id}>
                <span>{control.label}</span>
                <select
                    id={id}
                    value={control.value}
                    disabled={disabled}
                    onChange={(event) => onCommit(event.target.value)}
                >
                    {!control.options.some(
                        (option) => option.value === control.value,
                    ) && <option value={control.value}>Choose…</option>}
                    {control.options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </label>
        );
    return (
        <form
            className="home-control-form"
            onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                onCommit(data.get("value"));
                if (control.kind === "text" && control.inputType === "password")
                    event.currentTarget.reset();
            }}
        >
            <label htmlFor={id}>{control.label}</label>
            <div>
                <input
                    key={String(control.value)}
                    id={id}
                    name="value"
                    type={
                        control.kind === "color"
                            ? "color"
                            : (control.inputType ?? "text")
                    }
                    defaultValue={control.value}
                    disabled={disabled}
                    {...(control.kind === "text"
                        ? {
                              minLength: control.minLength,
                              maxLength: control.maxLength,
                              pattern: control.pattern,
                              step:
                                  control.inputType === "time" ||
                                  control.inputType === "datetime-local"
                                      ? 1
                                      : undefined,
                              autoComplete:
                                  control.inputType === "password"
                                      ? "off"
                                      : undefined,
                          }
                        : {})}
                />
                <button
                    className="home-apply"
                    type="submit"
                    disabled={disabled}
                >
                    Apply
                </button>
            </div>
        </form>
    );
}
function RangeControl({
    control,
    disabled,
    onCommit,
}: DeviceControlProps & {
    control: Extract<DeviceControl, { kind: "range" }>;
}) {
    const [draft, setDraft] = useState<number | null>(null);
    return (
        <Slider.Root
            className={
                control.id === "brightness"
                    ? "home-range home-range-hero"
                    : "home-range"
            }
            orientation={
                control.id === "brightness" ? "vertical" : "horizontal"
            }
            value={draft ?? control.value}
            disabled={disabled}
            min={control.min}
            max={control.max}
            step={control.step}
            onValueChange={(value) => setDraft(value)}
            onValueCommitted={(value) => {
                setDraft(null);
                onCommit(value);
            }}
        >
            <div className="home-range-label">
                <Slider.Label>{control.label}</Slider.Label>
                <span>
                    {new Intl.NumberFormat(undefined, {
                        maximumFractionDigits: control.step >= 1 ? 0 : 3,
                    }).format(draft ?? control.value)}
                    {control.unit}
                </span>
            </div>
            <Slider.Control className="home-range-control">
                <Slider.Track className="home-range-track">
                    <Slider.Indicator className="home-range-indicator" />
                    <Slider.Thumb
                        className="home-range-thumb"
                        aria-label={control.label}
                    />
                </Slider.Track>
            </Slider.Control>
        </Slider.Root>
    );
}
