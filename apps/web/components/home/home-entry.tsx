"use client";

import { DeviceAccessory } from "@repo/components/home/device-accessory";
import type { DeviceCommand } from "@repo/home-assistant/controls";
import {
    useEntity,
    useEntityIds,
    useHass,
    useQuery,
    useRegistry,
} from "@repo/home-assistant/hooks";
import type { RegistryState } from "@repo/home-assistant/registry";
import Link from "next/link";
import { memo, useCallback, useMemo, useState } from "react";
import { ConnectionPanel } from "../connection-panel";
import {
    groupEntityIds,
    type HomeCategory,
    type HomeGroup,
    inCategory,
} from "./groups";
import { EmptyHome, HomeShell } from "./home-shell";

const LiveAccessory = memo(function LiveAccessory({
    id,
    disabled,
    onCommand,
}: {
    id: string;
    disabled: boolean;
    onCommand: (command: DeviceCommand) => Promise<void>;
}) {
    const entity = useEntity(id);
    return entity ? (
        <DeviceAccessory
            entity={entity}
            disabled={disabled}
            onCommand={onCommand}
        />
    ) : null;
});

interface LiveGridProps {
    groups: readonly HomeGroup[];
    selectedRoom: string;
    category: HomeCategory;
    disabled: boolean;
    onCommand: (command: DeviceCommand) => Promise<void>;
    searching?: boolean;
}

function takeGroups(groups: readonly HomeGroup[], limit: number): HomeGroup[] {
    const result: HomeGroup[] = [];
    let remaining = limit;
    for (const group of groups) {
        if (remaining <= 0) break;
        const entityIds = group.entityIds.slice(0, remaining);
        result.push({ ...group, entityIds });
        remaining -= entityIds.length;
    }
    return result;
}

function LiveGrid({
    groups,
    selectedRoom,
    category,
    disabled,
    onCommand,
    searching,
}: LiveGridProps) {
    const [limit, setLimit] = useState(60);
    const visible = groups
        .filter((group) => selectedRoom === "all" || selectedRoom === group.id)
        .map((group) => ({
            ...group,
            entityIds: group.entityIds.filter((id) => inCategory(id, category)),
        }))
        .filter((group) => group.entityIds.length);
    if (!visible.length)
        return <EmptyHome searching={searching || category !== "all"} />;
    const total = visible.reduce(
        (sum, group) => sum + group.entityIds.length,
        0,
    );
    const page = takeGroups(visible, limit);
    return (
        <>
            <div className="home-dashboard-rooms">
                {page.map((group) => (
                    <section
                        className="home-dashboard-room"
                        key={group.id}
                        aria-label={group.name}
                    >
                        <div className="home-dashboard-room-heading">
                            <h2>{group.name}</h2>
                            <span>
                                {group.entityIds.length}{" "}
                                {group.entityIds.length === 1
                                    ? "accessory"
                                    : "accessories"}
                            </span>
                        </div>
                        <div className="home-dashboard-grid">
                            {group.entityIds.map((id) => (
                                <LiveAccessory
                                    key={id}
                                    id={id}
                                    disabled={disabled}
                                    onCommand={onCommand}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </div>
            {total > limit && (
                <div className="home-dashboard-pagination">
                    <span>
                        {limit.toLocaleString()} of {total.toLocaleString()}{" "}
                        accessories
                    </span>
                    <button
                        type="button"
                        onClick={() => setLimit((current) => current + 60)}
                    >
                        Show more accessories
                    </button>
                </div>
            )}
        </>
    );
}
function LiveSearch({
    query,
    registry,
    ...props
}: Omit<LiveGridProps, "groups"> & { query: string; registry: RegistryState }) {
    const matches = useQuery(query);
    const groups = groupEntityIds(
        matches.map((entity) => entity.entity_id),
        registry,
    );
    return <LiveGrid {...props} groups={groups} searching />;
}

function ConnectedHome() {
    const ids = useEntityIds();
    const registry = useRegistry();
    const { status, callService, logout } = useHass();
    const groups = useMemo(
        () => groupEntityIds(ids, registry),
        [ids, registry],
    );
    const [selectedRoom, setSelectedRoom] = useState("all");
    const [category, setCategory] = useState<HomeCategory>("all");
    const [query, setQuery] = useState("");
    const onCommand = useCallback(
        async (command: DeviceCommand) => {
            await callService(
                command.domain,
                command.service,
                command.data,
                command.target,
            );
        },
        [callService],
    );
    const currentRoom = groups.some((group) => group.id === selectedRoom)
        ? selectedRoom
        : "all";
    const gridProps = {
        selectedRoom: currentRoom,
        category,
        disabled: status !== "connected",
        onCommand,
    };
    const viewKey = `${currentRoom}:${category}:${query}`;
    return (
        <HomeShell
            groups={groups}
            selectedRoom={currentRoom}
            onRoomChange={setSelectedRoom}
            category={category}
            onCategoryChange={setCategory}
            query={query}
            onQueryChange={setQuery}
            reconnecting={status === "reconnecting"}
            notice={registry.error}
            onLogout={() => void logout()}
        >
            {query.trim() ? (
                <LiveSearch
                    key={viewKey}
                    {...gridProps}
                    registry={registry}
                    query={query}
                />
            ) : (
                <LiveGrid key={viewKey} {...gridProps} groups={groups} />
            )}
        </HomeShell>
    );
}

/** Authentication routes and the home route share one connection-aware entry point. */
export function HomeEntry() {
    const { status } = useHass();
    if (status === "connected" || status === "reconnecting")
        return <ConnectedHome />;
    return (
        <div className="home-dashboard-setup">
            <ConnectionPanel />
            <Link className="home-dashboard-preview-link" href="/preview">
                Explore the sample home <span aria-hidden="true">↗</span>
            </Link>
        </div>
    );
}
