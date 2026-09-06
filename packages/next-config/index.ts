import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

/** Shared defaults without application-specific hosts or service credentials. */
export const config: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    productionBrowserSourceMaps: false,
    typescript: { ignoreBuildErrors: false },
    images: { formats: ["image/avif", "image/webp"] },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "Referrer-Policy", value: "no-referrer" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                ],
            },
        ];
    },
};

/** Opt-in bundle inspection; run Next with --webpack when ANALYZE=true. */
export const withAnalyzer = bundleAnalyzer({
    enabled: process.env.ANALYZE === "true",
});
