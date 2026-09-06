import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@repo/components/globals.css";
import "@repo/components/home.css";
import { Providers } from "./providers";
export const metadata: Metadata = {
    title: "Homescreen",
    description: "A starting point for your Home Assistant interface.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
