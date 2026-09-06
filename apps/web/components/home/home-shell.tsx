"use client";

import { DeviceIcon } from "@repo/components/home/device-icon";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { categories, type HomeCategory, type HomeGroup } from "./groups";
import "./dashboard.css";

function HouseIcon({ small = false }: { small?: boolean }) {
    return (
        <span
            className={
                small ? "home-dashboard-house-small" : "home-dashboard-house"
            }
        >
            <DeviceIcon domain="home" />
        </span>
    );
}

function HomeClock() {
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => {
        const update = () => setNow(new Date());
        const first = setTimeout(update, 0);
        const timer = setInterval(update, 30_000);
        return () => {
            clearTimeout(first);
            clearInterval(timer);
        };
    }, []);
    return (
        <div className="home-dashboard-clock">
            <time dateTime={now?.toISOString()}>
                {now
                    ? now.toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: false,
                      })
                    : "—:—"}
            </time>
            <span>
                {now
                    ? now.toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                      })
                    : "Welcome home"}
            </span>
        </div>
    );
}

export interface HomeShellProps {
    groups: readonly HomeGroup[];
    selectedRoom: string;
    onRoomChange: (id: string) => void;
    category: HomeCategory;
    onCategoryChange: (category: HomeCategory) => void;
    query: string;
    onQueryChange: (query: string) => void;
    preview?: boolean;
    reconnecting?: boolean;
    notice?: string | null;
    toolbar?: ReactNode;
    onLogout?: () => void;
    children: ReactNode;
}

/** Shared responsive shell. Live and sample dashboards provide independent data and commands. */
export function HomeShell({
    groups,
    selectedRoom,
    onRoomChange,
    category,
    onCategoryChange,
    query,
    onQueryChange,
    preview = false,
    reconnecting = false,
    notice,
    toolbar,
    onLogout,
    children,
}: HomeShellProps) {
    const room = groups.find((group) => group.id === selectedRoom);
    function chooseRoom(id: string) {
        onRoomChange(id);
        onQueryChange("");
    }
    return (
        <div className="home-dashboard">
            <aside
                className="home-dashboard-sidebar"
                aria-label="Home navigation"
            >
                <HomeClock />
                <div className="home-dashboard-brand">
                    <span className="home-dashboard-brandmark">
                        <HouseIcon />
                    </span>
                    <div>
                        <strong>Homescreen</strong>
                        <span>{preview ? "Sample home" : "My home"}</span>
                    </div>
                </div>
                <nav className="home-dashboard-navigation" aria-label="Rooms">
                    <button
                        className="home-dashboard-navitem"
                        type="button"
                        aria-current={
                            selectedRoom === "all" ? "page" : undefined
                        }
                        onClick={() => chooseRoom("all")}
                    >
                        <HouseIcon small />
                        <span>Home</span>
                    </button>
                    <p className="home-dashboard-navlabel">Rooms</p>
                    {groups.map((group) => (
                        <button
                            key={group.id}
                            className="home-dashboard-navitem"
                            type="button"
                            aria-current={
                                selectedRoom === group.id ? "page" : undefined
                            }
                            onClick={() => chooseRoom(group.id)}
                        >
                            <span
                                className="home-dashboard-roomdot"
                                aria-hidden="true"
                            />
                            <span>{group.name}</span>
                            <small>{group.entityIds.length}</small>
                        </button>
                    ))}
                </nav>
                <div className="home-dashboard-sidebar-footer">
                    <div className="home-dashboard-connection">
                        <span
                            data-offline={reconnecting || undefined}
                            aria-hidden="true"
                        />
                        <span>
                            {preview
                                ? "Local preview"
                                : reconnecting
                                  ? "Reconnecting"
                                  : "Connected to your home"}
                        </span>
                    </div>
                    {preview ? (
                        <Link href="/">
                            Connect your home <span aria-hidden="true">↗</span>
                        </Link>
                    ) : (
                        <button type="button" onClick={onLogout}>
                            Log out of Home Assistant{" "}
                            <span aria-hidden="true">↗</span>
                        </button>
                    )}
                </div>
            </aside>
            <main className="home-dashboard-main">
                <header className="home-dashboard-header">
                    <div className="home-dashboard-title">
                        <h1>{room?.name ?? "Home"}</h1>
                        {preview && (
                            <span className="home-dashboard-sample-label">
                                Sample home
                            </span>
                        )}
                    </div>
                    <label className="home-dashboard-search">
                        <DeviceIcon domain="search" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) =>
                                onQueryChange(event.target.value)
                            }
                            placeholder="Search"
                            aria-label="Find an accessory"
                        />
                    </label>
                </header>
                <div className="home-dashboard-mobile-rooms">
                    <label htmlFor="home-room">Room</label>
                    <select
                        id="home-room"
                        value={room ? selectedRoom : "all"}
                        onChange={(event) => chooseRoom(event.target.value)}
                    >
                        <option value="all">All rooms</option>
                        {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                                {group.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="home-dashboard-controls-bar">
                    <div
                        className="home-dashboard-filters"
                        role="group"
                        aria-label="Accessory categories"
                    >
                        {categories.map((item) => (
                            <button
                                type="button"
                                key={item.id}
                                aria-pressed={category === item.id}
                                onClick={() => onCategoryChange(item.id)}
                            >
                                <DeviceIcon
                                    domain={
                                        {
                                            all: "home",
                                            lighting: "light",
                                            climate: "climate",
                                            security: "lock",
                                            media: "media_player",
                                        }[item.id]
                                    }
                                />
                                {item.name}
                            </button>
                        ))}
                    </div>
                    {preview && toolbar}
                </div>
                {reconnecting && (
                    <div className="home-dashboard-notice" role="status">
                        Reconnecting to Home Assistant. Controls will be
                        available when live updates return.
                    </div>
                )}
                {notice && (
                    <div className="home-dashboard-notice" role="status">
                        {notice}
                    </div>
                )}
                {children}
                <footer className="home-dashboard-footer">
                    <span>
                        {preview
                            ? "Preview only · Changes stay here. No real devices connected."
                            : "Home Assistant · Live updates"}
                    </span>
                    {!preview && (
                        <Link href="/preview">
                            Explore the sample home{" "}
                            <span aria-hidden="true">↗</span>
                        </Link>
                    )}
                </footer>
            </main>
        </div>
    );
}

export function EmptyHome({ searching = false }: { searching?: boolean }) {
    return (
        <section className="home-dashboard-empty">
            <HouseIcon />
            <h2>
                {searching ? "No accessories found" : "A little quiet in here"}
            </h2>
            <p>
                {searching
                    ? "Try a different name, category, or room."
                    : "Accessories will appear here when Home Assistant makes them available."}
            </p>
            {!searching && (
                <Link href="/preview">
                    Take a look around the sample home{" "}
                    <span aria-hidden="true">↗</span>
                </Link>
            )}
        </section>
    );
}
