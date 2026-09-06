"use client";

import { Alert, AlertDescription, AlertTitle } from "@repo/components/ui/alert";
import { Badge } from "@repo/components/ui/badge";
import { Button } from "@repo/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@repo/components/ui/card";
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from "@repo/components/ui/field";
import { Input } from "@repo/components/ui/input";
import { Spinner } from "@repo/components/ui/spinner";
import { useEntities, useHass } from "@repo/home-assistant/hooks";
import type { FormEvent } from "react";

const statusLabels = {
    disconnected: "Not connected",
    connecting: "Connecting",
    connected: "Connected",
    reconnecting: "Reconnecting",
    error: "Connection needs attention",
} as const;

function EntitySummary() {
    const entities = useEntities();
    return (
        <p className="text-muted-foreground text-sm">
            {Object.keys(entities).length.toLocaleString()} entities available.
            Updates arrive automatically.
        </p>
    );
}

/** Minimal connection setup. The Home Assistant sign-in page handles credentials. */
export function ConnectionPanel() {
    const { status, error, instanceUrl, connect, retry, disconnect, logout } =
        useHass();
    const busy = status === "connecting" || status === "reconnecting";
    const hasConnection = status === "connected" || status === "reconnecting";
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("instance");
        if (typeof value === "string") void connect(value);
    }

    return (
        <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-6 p-6">
            <header className="flex flex-col gap-2">
                <p className="font-medium text-muted-foreground text-sm">
                    Homescreen
                </p>
                <h1 className="font-semibold text-2xl tracking-tight">
                    Connect to Home Assistant
                </h1>
                <p className="text-muted-foreground text-sm">
                    Your home, ready for a new interface.
                </p>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle>Home Assistant</CardTitle>
                    <CardDescription>
                        Connect using your existing Home Assistant account.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                    <div role="status" aria-live="polite">
                        <Badge
                            variant={
                                status === "connected" ? "default" : "secondary"
                            }
                        >
                            {statusLabels[status]}
                        </Badge>
                    </div>
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Connection needs attention</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {hasConnection ? (
                        <div className="flex flex-col gap-2">
                            <p className="break-all text-sm">{instanceUrl}</p>
                            {status === "connected" ? (
                                <EntitySummary />
                            ) : (
                                <p className="text-muted-foreground text-sm">
                                    Waiting for Home Assistant. Updates will
                                    resume when the connection returns.
                                </p>
                            )}
                        </div>
                    ) : (
                        <form onSubmit={submit}>
                            <FieldGroup>
                                <Field data-disabled={busy}>
                                    <FieldLabel htmlFor="instance">
                                        Instance URL
                                    </FieldLabel>
                                    <Input
                                        id="instance"
                                        name="instance"
                                        type="url"
                                        required
                                        autoComplete="url"
                                        placeholder="http://homeassistant.local:8123"
                                        defaultValue={
                                            process.env
                                                .NEXT_PUBLIC_HOME_ASSISTANT_URL ??
                                            ""
                                        }
                                        disabled={busy}
                                        aria-describedby="instance-help"
                                    />
                                    <FieldDescription id="instance-help">
                                        Use an address this browser can reach.
                                        An HTTPS app needs an HTTPS Home
                                        Assistant address.
                                    </FieldDescription>
                                </Field>
                                <Button type="submit" disabled={busy}>
                                    {busy && (
                                        <Spinner
                                            data-icon="inline-start"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {busy ? "Connecting…" : "Connect"}
                                </Button>
                            </FieldGroup>
                        </form>
                    )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                    {status === "error" && instanceUrl && (
                        <Button variant="outline" onClick={() => void retry()}>
                            Retry connection
                        </Button>
                    )}
                    {busy && (
                        <Button variant="outline" onClick={disconnect}>
                            Cancel
                        </Button>
                    )}
                    {(hasConnection || instanceUrl) && (
                        <Button variant="ghost" onClick={() => void logout()}>
                            Log out
                        </Button>
                    )}
                    {!instanceUrl && !busy && (
                        <p className="text-muted-foreground text-xs">
                            Sign-in is kept in this browser tab’s session.
                        </p>
                    )}
                </CardFooter>
            </Card>
        </main>
    );
}
