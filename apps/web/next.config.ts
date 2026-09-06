import { config, withAnalyzer } from "@repo/next-config";
export default withAnalyzer({
  ...config,
  transpilePackages: ["@repo/components", "@repo/home-assistant"],
});
