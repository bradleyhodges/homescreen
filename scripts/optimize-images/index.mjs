#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
    mkdir,
    open,
    readFile,
    rename,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { availableParallelism } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");

const policyVersion = 1;
const manifestPath = resolve(repoRoot, ".image-optimizer-cache.json");
const lockPath = `${manifestPath}.lock`;
const supportedExtensions = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".avif",
]);
const defaultScopes = [
    "apps/api/app",
    "apps/www/app",
    "apps/www/public",
    "apps/portal/app",
    "apps/portal/public",
    "packages/design-system/branding",
];

const optimizerPolicy = {
    jpeg: {
        quality: 84,
        mozjpeg: true,
        progressive: true,
        chromaSubsampling: "4:2:0",
    },
    png: {
        compressionLevel: 9,
        adaptiveFiltering: true,
    },
    pngPalette: {
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true,
        quality: 92,
        effort: 10,
    },
    webp: {
        quality: 82,
        effort: 6,
    },
    avif: {
        quality: 58,
        effort: 6,
    },
    resize: {
        maxDimension: 2560,
    },
    savings: {
        minBytes: 1024,
        minRatio: 0.015,
    },
};

sharp.concurrency(Math.max(1, Math.min(4, availableParallelism())));

const usage = `Usage: pnpm images:optimize [options]

Options:
  --scope <path>   Limit optimization to a repo path. Can be repeated.
  --check          Fail when any image would be optimized. Does not write files.
  --dry-run        Report what would change without writing files.
  --force          Ignore the manifest and re-check every candidate image.
  --json           Print a JSON summary.
  --quiet          Suppress per-file change output.
`;

function parseArgs(argv) {
    const options = {
        check: false,
        dryRun: false,
        force: false,
        json: false,
        quiet: false,
        scopes: [],
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === "--") {
            continue;
        }

        if (arg === "--help" || arg === "-h") {
            console.log(usage);
            process.exit(0);
        }

        if (arg === "--check") {
            options.check = true;
            continue;
        }

        if (arg === "--dry-run") {
            options.dryRun = true;
            continue;
        }

        if (arg === "--force") {
            options.force = true;
            continue;
        }

        if (arg === "--json") {
            options.json = true;
            continue;
        }

        if (arg === "--quiet") {
            options.quiet = true;
            continue;
        }

        if (arg === "--scope") {
            const scope = argv[index + 1];
            if (!scope) {
                throw new Error("--scope requires a path");
            }
            options.scopes.push(normalizePath(scope));
            index += 1;
            continue;
        }

        if (arg.startsWith("--scope=")) {
            options.scopes.push(normalizePath(arg.slice("--scope=".length)));
            continue;
        }

        throw new Error(`Unknown option: ${arg}`);
    }

    return options;
}

function normalizePath(value) {
    return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function isWithinScope(filePath, scopes) {
    return scopes.some(
        (scope) => filePath === scope || filePath.startsWith(`${scope}/`),
    );
}

function isCandidate(filePath, scopes) {
    const normalized = normalizePath(filePath);
    const extension = extname(normalized).toLowerCase();

    if (!supportedExtensions.has(extension)) {
        return false;
    }

    if (
        normalized.includes("/node_modules/") ||
        normalized.includes("/.next/")
    ) {
        return false;
    }

    const activeScopes = scopes.length > 0 ? scopes : defaultScopes;
    return isWithinScope(normalized, activeScopes);
}

async function gitTrackedFiles() {
    try {
        const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
            cwd: repoRoot,
            encoding: "buffer",
            maxBuffer: 30 * 1024 * 1024,
        });

        return stdout
            .toString("utf8")
            .split("\0")
            .filter(Boolean)
            .map(normalizePath);
    } catch {
        return [];
    }
}

async function readManifest() {
    try {
        const raw = await readFile(manifestPath, "utf8");
        const parsed = JSON.parse(raw);

        if (parsed?.version !== 1 || typeof parsed.files !== "object") {
            return createEmptyManifest();
        }

        return parsed;
    } catch {
        return createEmptyManifest();
    }
}

function createEmptyManifest() {
    return {
        version: 1,
        policyVersion,
        files: {},
    };
}

function createSerializableManifest(manifest) {
    const files =
        manifest?.files && typeof manifest.files === "object"
            ? manifest.files
            : {};
    const sortedFiles = Object.fromEntries(
        Object.entries(files).sort(([left], [right]) =>
            left.localeCompare(right),
        ),
    );

    return {
        version: 1,
        policyVersion,
        files: sortedFiles,
    };
}

function manifestComparator(manifest) {
    return JSON.stringify({
        version: manifest?.version,
        policyVersion: manifest?.policyVersion,
        files: createSerializableManifest(manifest).files,
    });
}

async function writeManifest(manifest) {
    const nextManifest = createSerializableManifest(manifest);
    let currentManifest = null;

    try {
        currentManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
        currentManifest = null;
    }

    if (
        currentManifest &&
        manifestComparator(currentManifest) === manifestComparator(nextManifest)
    ) {
        return;
    }

    const manifestToWrite = {
        ...nextManifest,
        updatedAt: new Date().toISOString(),
    };
    const tempPath = `${manifestPath}.${process.pid}.tmp`;

    await writeFile(
        tempPath,
        `${JSON.stringify(manifestToWrite, null, 2)}\n`,
        "utf8",
    );
    await rename(tempPath, manifestPath);
}

async function withManifestLock(callback) {
    const staleAfterMs = 10 * 60 * 1000;

    for (let attempt = 0; attempt < 240; attempt += 1) {
        try {
            const handle = await open(lockPath, "wx");
            await handle.writeFile(
                `${process.pid}\n${new Date().toISOString()}\n`,
            );
            await handle.close();

            try {
                return await callback();
            } finally {
                await rm(lockPath, { force: true });
            }
        } catch (error) {
            if (error?.code !== "EEXIST") {
                throw error;
            }

            try {
                const lockStats = await stat(lockPath);
                if (Date.now() - lockStats.mtimeMs > staleAfterMs) {
                    await rm(lockPath, { force: true });
                    continue;
                }
            } catch {
                continue;
            }

            await wait(250);
        }
    }

    throw new Error("Timed out waiting for the image optimizer manifest lock");
}

function wait(ms) {
    return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function hashFile(filePath) {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    for await (const chunk of stream) {
        hash.update(chunk);
    }

    return hash.digest("hex");
}

function shouldResize(metadata) {
    const { width, height } = metadata;
    const maxDimension = optimizerPolicy.resize.maxDimension;

    return Boolean(
        width && height && (width > maxDimension || height > maxDimension),
    );
}

function shouldUsePngPalette(relativeFilePath, size) {
    if (size < 120 * 1024) {
        return false;
    }

    if (
        relativeFilePath.includes("/brand/") ||
        relativeFilePath.includes("/icon/")
    ) {
        return false;
    }

    if (
        /(apple-icon|android-icon|ms-icon|favicon|opengraph|twitter-image)/i.test(
            relativeFilePath,
        )
    ) {
        return false;
    }

    return (
        relativeFilePath.includes("/media/") ||
        relativeFilePath.includes("/decorative/")
    );
}

function buildPipeline(filePath, relativeFilePath, metadata, size) {
    const extension = extname(relativeFilePath).toLowerCase();
    let pipeline = sharp(filePath, { failOn: "none" }).rotate();
    const transforms = [];

    if (shouldResize(metadata)) {
        transforms.push(`resize<=${optimizerPolicy.resize.maxDimension}px`);
        pipeline = pipeline.resize({
            width: optimizerPolicy.resize.maxDimension,
            height: optimizerPolicy.resize.maxDimension,
            fit: "inside",
            withoutEnlargement: true,
        });
    }

    if (
        metadata.format === "jpeg" ||
        extension === ".jpg" ||
        extension === ".jpeg"
    ) {
        transforms.push("mozjpeg");
        return {
            pipeline: pipeline.jpeg(optimizerPolicy.jpeg),
            strategy: transforms.join("+"),
        };
    }

    if (metadata.format === "png" || extension === ".png") {
        const usePalette = shouldUsePngPalette(relativeFilePath, size);
        transforms.push(usePalette ? "png-palette" : "png-lossless");
        return {
            pipeline: pipeline.png(
                usePalette ? optimizerPolicy.pngPalette : optimizerPolicy.png,
            ),
            strategy: transforms.join("+"),
        };
    }

    if (metadata.format === "webp" || extension === ".webp") {
        transforms.push("webp");
        return {
            pipeline: pipeline.webp(optimizerPolicy.webp),
            strategy: transforms.join("+"),
        };
    }

    if (metadata.format === "avif" || extension === ".avif") {
        transforms.push("avif");
        return {
            pipeline: pipeline.avif(optimizerPolicy.avif),
            strategy: transforms.join("+"),
        };
    }

    return null;
}

function hasMeaningfulSaving(beforeSize, afterSize) {
    const savedBytes = beforeSize - afterSize;
    const savedRatio = savedBytes / beforeSize;

    return (
        savedBytes >= optimizerPolicy.savings.minBytes &&
        savedRatio >= optimizerPolicy.savings.minRatio
    );
}

async function optimizeFile(relativeFilePath, manifest, options) {
    const filePath = resolve(repoRoot, relativeFilePath);
    const beforeStats = await stat(filePath);
    const beforeHash = await hashFile(filePath);
    const cached = manifest.files[relativeFilePath];

    if (
        !options.force &&
        cached?.hash === beforeHash &&
        cached?.policyVersion === policyVersion
    ) {
        return {
            status: "cached",
            path: relativeFilePath,
            beforeBytes: beforeStats.size,
            afterBytes: beforeStats.size,
            savedBytes: 0,
        };
    }

    const metadata = await sharp(filePath, { failOn: "none" }).metadata();

    if (
        (metadata.format === "webp" || metadata.format === "avif") &&
        !shouldResize(metadata)
    ) {
        if (!options.check && !options.dryRun) {
            manifest.files[relativeFilePath] = {
                hash: beforeHash,
                policyVersion,
                size: beforeStats.size,
                width: metadata.width ?? null,
                height: metadata.height ?? null,
                strategy: "modern-format-kept",
                checkedAt: new Date().toISOString(),
            };
        }

        return {
            status: "unchanged",
            path: relativeFilePath,
            beforeBytes: beforeStats.size,
            afterBytes: beforeStats.size,
            savedBytes: 0,
        };
    }

    const pipelineConfig = buildPipeline(
        filePath,
        relativeFilePath,
        metadata,
        beforeStats.size,
    );

    if (!pipelineConfig) {
        return {
            status: "skipped",
            path: relativeFilePath,
            reason: `unsupported format ${metadata.format ?? extname(relativeFilePath)}`,
            beforeBytes: beforeStats.size,
            afterBytes: beforeStats.size,
            savedBytes: 0,
        };
    }

    await mkdir(dirname(filePath), { recursive: true });
    const tempPath = join(
        dirname(filePath),
        `.optimized-${process.pid}-${Date.now()}-${basename(relativeFilePath)}`,
    );

    try {
        await pipelineConfig.pipeline.toFile(tempPath);
        const afterStats = await stat(tempPath);
        const shouldReplace = hasMeaningfulSaving(
            beforeStats.size,
            afterStats.size,
        );

        if (!shouldReplace) {
            await rm(tempPath, { force: true });

            if (!options.check && !options.dryRun) {
                manifest.files[relativeFilePath] = {
                    hash: beforeHash,
                    policyVersion,
                    size: beforeStats.size,
                    width: metadata.width ?? null,
                    height: metadata.height ?? null,
                    strategy: "already-optimal",
                    checkedAt: new Date().toISOString(),
                };
            }

            return {
                status: "unchanged",
                path: relativeFilePath,
                beforeBytes: beforeStats.size,
                afterBytes: beforeStats.size,
                savedBytes: 0,
            };
        }

        if (options.check || options.dryRun) {
            await rm(tempPath, { force: true });
            return {
                status: "would-optimize",
                path: relativeFilePath,
                beforeBytes: beforeStats.size,
                afterBytes: afterStats.size,
                savedBytes: beforeStats.size - afterStats.size,
                strategy: pipelineConfig.strategy,
            };
        }

        await rename(tempPath, filePath);
        const afterHash = await hashFile(filePath);
        const afterMetadata = await sharp(filePath, {
            failOn: "none",
        }).metadata();

        manifest.files[relativeFilePath] = {
            hash: afterHash,
            policyVersion,
            size: afterStats.size,
            width: afterMetadata.width ?? null,
            height: afterMetadata.height ?? null,
            strategy: pipelineConfig.strategy,
            optimizedAt: new Date().toISOString(),
        };

        return {
            status: "optimized",
            path: relativeFilePath,
            beforeBytes: beforeStats.size,
            afterBytes: afterStats.size,
            savedBytes: beforeStats.size - afterStats.size,
            strategy: pipelineConfig.strategy,
        };
    } catch (error) {
        await rm(tempPath, { force: true });
        throw error;
    }
}

async function mapLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let index = 0;

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (index < items.length) {
                const currentIndex = index;
                index += 1;
                results[currentIndex] = await mapper(items[currentIndex]);
            }
        }),
    );

    return results;
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function summarize(results) {
    const summary = {
        total: results.length,
        optimized: 0,
        wouldOptimize: 0,
        unchanged: 0,
        cached: 0,
        skipped: 0,
        failed: 0,
        savedBytes: 0,
    };

    for (const result of results) {
        if (result.status === "optimized") {
            summary.optimized += 1;
            summary.savedBytes += result.savedBytes;
        } else if (result.status === "would-optimize") {
            summary.wouldOptimize += 1;
            summary.savedBytes += result.savedBytes;
        } else if (result.status === "unchanged") {
            summary.unchanged += 1;
        } else if (result.status === "cached") {
            summary.cached += 1;
        } else if (result.status === "skipped") {
            summary.skipped += 1;
        } else if (result.status === "failed") {
            summary.failed += 1;
        }
    }

    return summary;
}

function printSummary(results, options) {
    const summary = summarize(results);
    const changed = results
        .filter(
            (result) =>
                result.status === "optimized" ||
                result.status === "would-optimize",
        )
        .sort((left, right) => right.savedBytes - left.savedBytes);

    if (options.json) {
        console.log(JSON.stringify({ summary, results }, null, 2));
        return;
    }

    if (!options.quiet && changed.length > 0) {
        for (const result of changed.slice(0, 20)) {
            const label =
                result.status === "would-optimize"
                    ? "would optimize"
                    : "optimized";
            console.log(
                `${label}: ${result.path} ${formatBytes(result.beforeBytes)} -> ${formatBytes(
                    result.afterBytes,
                )} (${formatBytes(result.savedBytes)} saved, ${result.strategy})`,
            );
        }

        if (changed.length > 20) {
            console.log(`...and ${changed.length - 20} more optimized images`);
        }
    }

    const verb = options.check || options.dryRun ? "checked" : "complete";
    console.log(
        `Image optimization ${verb}: ${summary.total} files, ${summary.optimized} optimized, ${summary.wouldOptimize} would optimize, ${summary.cached} cached, ${summary.unchanged} unchanged, ${summary.skipped} skipped, ${formatBytes(summary.savedBytes)} saved.`,
    );
}

async function main() {
    if (process.env.IMAGE_OPTIMIZER_SKIP === "1") {
        console.log("Image optimization skipped via IMAGE_OPTIMIZER_SKIP=1.");
        return;
    }

    const options = parseArgs(process.argv.slice(2));
    const scopes = options.scopes.map(normalizePath);
    const trackedFiles = await gitTrackedFiles();
    const files = trackedFiles
        .filter((filePath) => isCandidate(filePath, scopes))
        .sort((left, right) => left.localeCompare(right));

    if (files.length === 0) {
        console.log("Image optimization complete: no candidate images found.");
        return;
    }

    const results = await withManifestLock(async () => {
        const manifest = await readManifest();
        const nextResults = await mapLimit(
            files,
            sharp.concurrency(),
            async (filePath) => {
                try {
                    return await optimizeFile(filePath, manifest, options);
                } catch (error) {
                    return {
                        status: "failed",
                        path: filePath,
                        reason:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        beforeBytes: 0,
                        afterBytes: 0,
                        savedBytes: 0,
                    };
                }
            },
        );

        if (!options.check && !options.dryRun) {
            for (const filePath of Object.keys(manifest.files)) {
                if (!isCandidate(filePath, scopes)) {
                    continue;
                }

                if (!files.includes(filePath)) {
                    delete manifest.files[filePath];
                }
            }

            await writeManifest(manifest);
        }

        return nextResults;
    });

    printSummary(results, options);

    const summary = summarize(results);

    if (summary.failed > 0) {
        for (const result of results.filter(
            (entry) => entry.status === "failed",
        )) {
            console.error(`failed: ${result.path}: ${result.reason}`);
        }
        process.exit(1);
    }

    if (options.check && summary.wouldOptimize > 0) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
