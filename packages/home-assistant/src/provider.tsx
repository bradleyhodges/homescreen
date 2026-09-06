"use client";

import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";
import { createHassClient, type HassClient } from "./client";

const HassContext = createContext<HassClient | null>(null);

/** Mount once above routes, including /auth. Credentials stay in this browser tab's session. */
export function HassProvider({ children }: { children: ReactNode }) {
    const [client] = useState(createHassClient);
    useEffect(() => client.retain(), [client]);
    return (
        <HassContext.Provider value={client}>{children}</HassContext.Provider>
    );
}

/** Internal context boundary shared by the selector hooks. */
export function useHassClient() {
    const client = useContext(HassContext);
    if (!client)
        throw new Error("Home Assistant hooks require a HassProvider.");
    return client;
}
