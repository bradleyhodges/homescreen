import Link from "next/link";
export default function NotFound() {
    return (
        <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6">
            <h1 className="font-semibold text-2xl">Page not found</h1>
            <Link className="underline underline-offset-4" href="/">
                Return home
            </Link>
        </main>
    );
}
