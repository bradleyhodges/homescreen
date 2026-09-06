"use client";

import {
    type CopyState,
    useCopyToClipboard,
} from "@repo/components/hooks/use-copy-to-clipboard";
import { Button } from "@repo/components/ui/button";
import { Check, CircleX, Copy } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type CopyStateIconProps = {
    state: CopyState;
    idleIcon?: ReactNode;
    doneIcon?: ReactNode;
    errorIcon?: ReactNode;
};

/** Render the icon for the current clipboard operation. */
export function CopyStateIcon({
    state,
    idleIcon,
    doneIcon,
    errorIcon,
}: CopyStateIconProps) {
    return (
        <span aria-hidden="true">
            {state === "done"
                ? (doneIcon ?? <Check data-slot="done-icon" />)
                : state === "error"
                  ? (errorIcon ?? <CircleX data-slot="error-icon" />)
                  : (idleIcon ?? <Copy data-slot="idle-icon" />)}
        </span>
    );
}

export type CopyButtonProps = ComponentProps<typeof Button> &
    Omit<CopyStateIconProps, "state"> & {
        text: string | (() => string);
        onCopySuccess?: (text: string) => void;
        onCopyError?: (error: Error) => void;
    };

/** A clipboard button whose consumer click handler can cancel copying. */
export function CopyButton({
    size = "icon",
    type = "button",
    children,
    text,
    idleIcon,
    doneIcon,
    errorIcon,
    onClick,
    onCopySuccess,
    onCopyError,
    ...props
}: CopyButtonProps) {
    const { state, copy } = useCopyToClipboard({ onCopySuccess, onCopyError });
    return (
        <Button
            size={size}
            type={type}
            aria-label={
                state === "done"
                    ? "Copied"
                    : state === "error"
                      ? "Copy failed; try again"
                      : "Copy"
            }
            {...props}
            onClick={(event) => {
                onClick?.(event);
                if (!event.defaultPrevented) void copy(text);
            }}
        >
            <CopyStateIcon
                state={state}
                idleIcon={idleIcon}
                doneIcon={doneIcon}
                errorIcon={errorIcon}
            />
            {children}
            <span className="sr-only" role="status">
                {state === "done"
                    ? "Copied to clipboard"
                    : state === "error"
                      ? "Unable to copy to clipboard"
                      : ""}
            </span>
        </Button>
    );
}
