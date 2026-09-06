"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "done" | "error";
export type UseCopyToClipboardOptions = {
  onCopySuccess?: (text: string) => void;
  onCopyError?: (error: Error) => void;
  resetDelay?: number;
};

/** Copy text and expose temporary feedback; only the latest request updates feedback. */
export function useCopyToClipboard({
  onCopySuccess,
  onCopyError,
  resetDelay = 1500,
}: UseCopyToClipboardOptions = {}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string | (() => string)) => {
      if (!mounted.current) return;
      const request = ++generation.current;
      if (timer.current !== null) clearTimeout(timer.current);
      let value: string;
      let failure: Error | undefined;
      try {
        value = typeof text === "function" ? text() : text;
        if (!navigator.clipboard?.writeText)
          throw new Error("Clipboard access is unavailable.");
        await navigator.clipboard.writeText(value);
      } catch (error) {
        failure = error instanceof Error ? error : new Error("Copy failed");
      }
      if (!mounted.current || generation.current !== request) return;
      setState(failure ? "error" : "done");
      timer.current = setTimeout(
        () => {
          timer.current = null;
          setState("idle");
        },
        Math.max(0, resetDelay),
      );
      // Consumer errors must not be misreported as clipboard failures.
      if (failure) onCopyError?.(failure);
      else onCopySuccess?.(value!);
    },
    [onCopySuccess, onCopyError, resetDelay],
  );

  return { state, copy } as const;
}
