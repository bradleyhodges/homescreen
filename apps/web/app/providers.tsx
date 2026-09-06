"use client";
import { HassProvider } from "@repo/home-assistant/provider";
import type { ReactNode } from "react";

/** Keep a single Home Assistant connection alive across App Router navigation. */
export function Providers({ children }: { children: ReactNode }) {
    return <HassProvider>{children}</HassProvider>;
}
