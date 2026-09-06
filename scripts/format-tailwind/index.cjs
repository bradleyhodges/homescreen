const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const apps = ["web"];
const packages = ["components"];
const prettierConfigPath = path.join(__dirname, "prettier.config.cjs");

// Function to find the repository root
const findRepoRoot = () => {
    let currentDir = __dirname;
    while (!fs.existsSync(path.join(currentDir, "package.json"))) {
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            throw new Error("Could not find repository root");
        }
        currentDir = parentDir;
    }
    return currentDir;
};

const repoRoot = findRepoRoot();

console.log("Running linter (format mode) on configured apps...");

for (const app of apps) {
    try {
        // Path to the app
        const appPath = path.join(__dirname, "../../apps/", app);

        // Run the linter
        console.log("🧼 ", `Formatting ${app} now...`);
        execSync(
            `npx prettier --config "${prettierConfigPath}" --cache --write "**/*.{js,jsx,ts,tsx,css}"`,
            {
                cwd: appPath,
                stdio: "inherit",
            },
        );
    } catch (error) {
        console.error("❌", `Error formatting ${app}:`, error.message);
        process.exit(1);
    }

    console.log("🫧 ", `Successfully formatted ${app}!`);
}

console.log("✨ ", "All apps were formatted successfully.");

console.log("Running linter (format mode) on configured packages...");

for (const _package of packages) {
    try {
        // Path to the app
        const packagePath = path.join(__dirname, "../../packages/", _package);

        // Run the linter
        console.log("🧼 ", `Formatting ${_package} now...`);
        execSync(
            `npx prettier --config "${prettierConfigPath}" --cache --write "**/*.{js,jsx,ts,tsx,css}"`,
            {
                cwd: packagePath,
                stdio: "inherit",
            },
        );
    } catch (error) {
        console.error("❌", `Error formatting ${_package}:`, error.message);
        process.exit(1);
    }

    console.log("🫧 ", `Successfully formatted ${_package}!`);
}

console.log("✨ ", "All packages were formatted successfully.");

console.log("🧹 ", "Running biome format script...");
try {
    execSync("pnpm biome check . --write --skip-parse-errors", {
        cwd: repoRoot,
        stdio: "inherit",
    });

    console.log("🧹 ", "Biome check completed successfully!");
} catch (error) {
    console.error(
        "🧹 ",
        "Biome check failed:",
        error.stderr?.toString() || error.message,
    );
    process.exit(1); // Exit gracefully or continue as needed
}

console.log(
    "🎉 ",
    "All done! All apps were linted and formatted successfully.",
);
