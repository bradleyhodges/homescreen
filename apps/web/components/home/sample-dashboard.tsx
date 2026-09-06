"use client";

import { DeviceAccessory } from "@repo/components/home/device-accessory";
import {
    type DeviceCommand,
    getDeviceModel,
} from "@repo/home-assistant/controls";
import { memo, useCallback, useRef, useState } from "react";
import {
    categories,
    type HomeCategory,
    type HomeGroup,
    inCategory,
} from "./groups";
import { EmptyHome, HomeShell } from "./home-shell";
import { applySampleCommand } from "./sample-command";
import { createSampleEntities, SAMPLE_HOME } from "./sample-home";

const SampleTile = memo(DeviceAccessory);

/** An explicitly separate sample home. Commands update only this component's local state. */
export function SampleDashboard() {
    const [entities, setEntities] = useState(createSampleEntities);
    const currentEntities = useRef(entities);
    const [selectedRoom, setSelectedRoom] = useState("all");
    const [category, setCategory] = useState<HomeCategory>(categories[0].id);
    const [query, setQuery] = useState("");
    const [showCatalog, setShowCatalog] = useState(false);
    const onCommand = useCallback(async (command: DeviceCommand) => {
        // Reject unsupported commands back to the accessory UI, before scheduling a render.
        const next = applySampleCommand(currentEntities.current, command);
        currentEntities.current = next;
        setEntities(next);
    }, []);
    const groups: HomeGroup[] = [];
    for (const item of SAMPLE_HOME) {
        if (!showCatalog && !item.featured) continue;
        let group = groups.find((group) => group.id === item.room);
        if (!group) {
            group = { id: item.room, name: item.room, entityIds: [] };
            groups.push(group);
        }
        group.entityIds.push(item.entity.entity_id);
    }
    const currentRoom = groups.some((group) => group.id === selectedRoom)
        ? selectedRoom
        : "all";
    const search = query.trim().toLocaleLowerCase();
    const visible = groups
        .filter((group) => currentRoom === "all" || currentRoom === group.id)
        .map((group) => ({
            ...group,
            entityIds: group.entityIds.filter((id) => {
                const entity = entities[id];
                return (
                    entity &&
                    inCategory(id, category) &&
                    (!search ||
                        `${id} ${getDeviceModel(entity).name}`
                            .toLocaleLowerCase()
                            .includes(search))
                );
            }),
        }))
        .filter((group) => group.entityIds.length);
    return (
        <HomeShell
            groups={groups}
            selectedRoom={currentRoom}
            onRoomChange={setSelectedRoom}
            category={category}
            onCategoryChange={setCategory}
            query={query}
            onQueryChange={setQuery}
            preview
            toolbar={
                <label className="home-dashboard-preview-toggle">
                    <input
                        type="checkbox"
                        checked={showCatalog}
                        onChange={(event) =>
                            setShowCatalog(event.target.checked)
                        }
                    />
                    Show every device type
                </label>
            }
        >
            {visible.length ? (
                <div className="home-dashboard-rooms">
                    {visible.map((group) => (
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
                                {group.entityIds.map((id) => {
                                    const entity = entities[id];
                                    return entity ? (
                                        <SampleTile
                                            key={id}
                                            entity={entity}
                                            onCommand={onCommand}
                                        />
                                    ) : null;
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <EmptyHome searching />
            )}
        </HomeShell>
    );
}
