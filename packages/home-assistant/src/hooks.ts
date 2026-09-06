"use client";

import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useHassClient } from "./provider";
import { selectDomain, selectEntities, selectQuery } from "./selectors";

/** Subscribe only to this entity; unrelated entity updates do not rerender the consumer. */
export function useEntity(entityId: string) {
    return useStore(useHassClient().store, (state) => state.entities[entityId]);
}
/** Subscribe to entity membership, without rerendering for individual state changes. */
export function useEntityIds(): string[] {
    return useStore(
        useHassClient().store,
        useShallow((state) => Object.keys(state.entities)),
    );
}
/** Subscribe to all entities, or a list in caller-specified order. Missing IDs are omitted. */
export function useEntities(entityIds?: readonly string[]) {
    return useStore(
        useHassClient().store,
        useShallow((state) => selectEntities(state.entities, entityIds)),
    );
}
/** Subscribe only to entity references belonging to an exact domain. */
export function useDomain(domain: string) {
    return useStore(
        useHassClient().store,
        useShallow((state) => selectDomain(state.entities, domain)),
    );
}
/** Case-insensitive substring search of entity IDs and friendly names. */
export function useQuery(query: string) {
    return useStore(
        useHassClient().store,
        useShallow((state) => selectQuery(state.entities, query)),
    );
}
/** Connection status and stable actions, without subscribing to entity changes. */
export function useHass() {
    return useStore(
        useHassClient().store,
        useShallow((state) => ({
            status: state.status,
            error: state.error,
            instanceUrl: state.instanceUrl,
            connect: state.connect,
            retry: state.retry,
            disconnect: state.disconnect,
            logout: state.logout,
            callService: state.callService,
        })),
    );
}
/** Authentication and connection controls share one source of truth. */
export const useAuth = useHass;

/** Subscribe to room metadata independently of changing entity states. */
export function useRegistry() {
    return useStore(useHassClient().store, (state) => state.registry);
}
