import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const enableTurbopack = process.env.NEXT_TURBOPACK === "true";
const isProduction = process.env.NODE_ENV === "production";

export const config: NextConfig = {
    allowedDevOrigins: ["ambulancewa.localhost", "*.ambulancewa.localhost"],
    images: {
        formats: ["image/avif", "image/webp"],
        remotePatterns: [
            {
                protocol: "https",
                hostname: "ambulancewa.com.au",
            },
            {
                protocol: "https",
                hostname: "newsroom.ambulancewa.com.au",
            },
            {
                protocol: "https",
                hostname: "health.wa.gov.au",
            },
            {
                protocol: "https",
                hostname: "dfes.wa.gov.au",
            },
            {
                protocol: "https",
                hostname: "icon.horse",
            },
            ...(!isProduction
                ? [
                      {
                          protocol: "https" as const,
                          hostname: "ambulancewa.localhost",
                      },
                  ]
                : []),
        ],
        qualities: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    },
    // Keep experimental defined so consumers can safely spread it.
    experimental: {
        clientTraceMetadata: ["sentry-trace", "baggage"],
        serverActions: {
            allowedOrigins: ["*.ambulancewa.localhost"],
        },
    },
    logging: {
        fetches: {
            fullUrl: true,
        },
    },
    // Opt-in to Turbopack only when explicitly requested to avoid
    // unexpected crashes from the default build path.
    ...(enableTurbopack ? { turbopack: {} } : {}),
    // This is required to support PostHog trailing slash API requests
    skipTrailingSlashRedirect: true,
    typescript: {
        ignoreBuildErrors: false,
    },
    // Turn off the powered-by header
    poweredByHeader: false,
    // Disable production source maps
    productionBrowserSourceMaps: false,
};

export const withAnalyzer = (sourceConfig: NextConfig): NextConfig =>
    withBundleAnalyzer()(sourceConfig);
