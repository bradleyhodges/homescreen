"use client";
import { HassProvider } from "@repo/home-assistant/provider";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Keep a single Home Assistant connection alive across App Router navigation. */
export function Providers({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    if (pathname === "/preview") return children;
    return <HassProvider>{children}</HassProvider>;
}
