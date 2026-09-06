"use client";

import { Check, CircleX, Copy } from "lucide-react";
import type { HTMLMotionProps, Variants } from "motion/react";
import { AnimatePresence, m } from "motion/react";
import type { ComponentProps } from "react";
import type { CopyState } from "../hooks/use-copy-to-clipboard";
import { useCopyToClipboard } from "../hooks/use-copy-to-clipboard";
import { Button } from "./ui/button";

const motionIconVariants: Variants = {
    initial: { opacity: 0, scale: 0.8, filter: "blur(2px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, scale: 0.8 },
};

const motionIconProps: HTMLMotionProps<"span"> = {
    variants: motionIconVariants,
    initial: "initial",
    animate: "animate",
    exit: "exit",
    transition: { duration: 0.15, ease: "easeOut" },
};

export type CopyStateIconProps = {
    state: CopyState;
    /** Custom icon for idle state. */
    idleIcon?: React.ReactNode;
    /** Custom icon for done state. */
    doneIcon?: React.ReactNode;
    /** Custom icon for error state. */
    errorIcon?: React.ReactNode;
};

export function CopyStateIcon({
    state,
    idleIcon,
    doneIcon,
    errorIcon,
}: CopyStateIconProps) {
    return (
        <AnimatePresence mode="popLayout" initial={false}>
            {state === "idle" ? (
                <m.span key="idle" {...motionIconProps}>
                    {idleIcon ?? <Copy data-slot="idle-icon" />}
                </m.span>
            ) : state === "done" ? (
                <m.span key="done" {...motionIconProps}>
                    {doneIcon ?? <Check data-slot="done-icon" />}
                </m.span>
            ) : state === "error" ? (
                <m.span key="error" {...motionIconProps}>
                    {errorIcon ?? <CircleX data-slot="error-icon" />}
                </m.span>
            ) : null}
        </AnimatePresence>
    );
}

export type CopyButtonProps = ComponentProps<typeof Button> & {
    /** The text to copy, or a function that returns the text. */
    text: string | (() => string);
    /** Called with the copied text on successful copy. */
    onCopySuccess?: (text: string) => void;
    /** Called with the error if the copy operation fails. */
    onCopyError?: (error: Error) => void;
} & Omit<CopyStateIconProps, "state">;

export function CopyButton({
    size = "icon",
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
    const { state, copy } = useCopyToClipboard({
        onCopySuccess,
        onCopyError,
    });

    return (
        <Button
            className="will-change-transform"
            size={size}
            onClick={(e) => {
                copy(text);
                onClick?.(e);
            }}
            aria-label="Copy"
            {...props}
        >
            <CopyStateIcon
                state={state}
                idleIcon={idleIcon}
                doneIcon={doneIcon}
                errorIcon={errorIcon}
            />
            {children}
        </Button>
    );
}
