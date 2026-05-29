import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

// The repo writes relative imports with explicit `.js` extensions (NodeNext style). esbuild does
// not map `.js` -> `.ts`, so this plugin rewrites relative `.js` specifiers to their `.ts` source
// when one exists. Package specifiers (e.g. @puristic/env/index.js) and already-built `.js`
// files (core's dist) fall through to esbuild's default resolution.
const tsExtensionPlugin = {
    name: "resolve-ts-from-js",
    setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^\.\.?\/.*\.js$/ }, (args) => {
            const candidate = resolve(args.resolveDir, `${args.path.slice(0, -3)}.ts`);
            return existsSync(candidate) ? { path: candidate } : undefined;
        });
    },
};

/** Extension host: ESM source -> single CJS bundle that VSCode `require()`s. `vscode` is injected by the host. */
const hostBuild = {
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.cjs",
    platform: "node",
    format: "cjs",
    target: "node20",
    bundle: true,
    sourcemap: true,
    external: ["vscode"],
    plugins: [tsExtensionPlugin],
    logLevel: "info",
};

/** Webview: browser bundle (no module loader) loaded via a single <script> under a strict CSP. CSS is extracted to dist/webview.css. */
const webviewBuild = {
    entryPoints: ["src/webview/main.ts"],
    outfile: "dist/webview.js",
    platform: "browser",
    format: "iife",
    target: "es2022",
    bundle: true,
    sourcemap: true,
    plugins: [tsExtensionPlugin],
    logLevel: "info",
};

/**
 * Config-host: standalone ESM script run by a separate Node 24 process (fork). It resolves
 * @puristic/env and the user's env.config from the workspace at runtime, so
 * nothing here is bundled in — only node builtins are used.
 */
const configHostBuild = {
    entryPoints: ["src/host/configHost/bin/entry.ts"],
    outfile: "dist/configHost.mjs",
    platform: "node",
    format: "esm",
    target: "node20",
    bundle: true,
    sourcemap: true,
    plugins: [tsExtensionPlugin],
    logLevel: "info",
};

const configs = [hostBuild, webviewBuild, configHostBuild];

if (watch) {
    const contexts = await Promise.all(configs.map((config) => context(config)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log("esbuild watching…");
} else {
    await Promise.all(configs.map((config) => build(config)));
}
