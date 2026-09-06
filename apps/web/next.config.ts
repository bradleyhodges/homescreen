import { config, withAnalyzer } from "@repo/next-config";
export default withAnalyzer({
    ...config,
    experimental: {
        ...config.experimental,
        optimizePackageImports: ["@bradleyhodges/sfsymbols"],
    },
    transpilePackages: ["@repo/components", "@repo/home-assistant"],
});
