"use client";
import { Button } from "@repo/components/ui/button";

export default function ErrorPage({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6">
            <h1 className="font-semibold text-2xl">Something went wrong</h1>
            <p className="text-muted-foreground">
                Try loading this screen again.
            </p>
            <Button onClick={reset}>Try again</Button>
        </main>
    );
}
