"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px)";
const subscribe = (notify: () => void) => {
    const media = window.matchMedia(QUERY);
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
};
const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => false;

/** Observe the mobile breakpoint without a server/client hydration mismatch. */
export function useIsMobile() {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
