# puristic

A VSCode extension that edits `.env` files through a typed, validated UI, driven by your
[`@puristic/env`](../core) configuration schema.

Open any `.env` file in a puristic workspace and the raw text editor is replaced by a
management panel with three parts: a **sidebar** listing every directory that contains `.env`
files (each with an aggregate status badge), a **key-value grid** grouped by your nested schema,
and a cross-service **overview matrix**. Missing, invalid, unknown, and secret variables are
flagged inline, and you can edit values or encrypt a secret in one click.

## How it knows your variables

The extension never guesses. It finds a **convention file** — `env.config.ts`
(`.mts`/`.cts`/`.js`/`.mjs`/`.cjs`) at a service or package root — and runs it in a short-lived
Node 24 subprocess. From `@puristic/env` (`inspectSchema` / `validateValues`) it reads the exact
set of expected variables: their types, defaults, secret flags, and live validation.

The config file must export the **raw `ConfigDefinition`** (schema + sources), not the result
of `loadConfig(...)`. `loadConfig` loads immediately, so it would fail on encrypted secrets:

```ts
// env.config.ts
import type { ConfigDefinition } from "@puristic/env/index.js";
import { z } from "zod";

export default {
    schema: z.object({
        nodeEnv: z.string(),
        server: z.object({ port: z.coerce.number().int(), host: z.string().default("0.0.0.0") }),
        database: z.object({ url: z.url().meta({ secret: true }) }),
    }),
    sources: [],
} satisfies ConfigDefinition<z.ZodType>;
```

A `default`, `config`, `definition`, or bare `schema` export all work. Each `.env` directory is
matched to its **nearest ancestor** `env.config.*`.

Schema paths map to env var names: `["server","httpsPort"]` → `SERVER_HTTPS_PORT`.

## Status model

| Status | Meaning |
| --- | --- |
| OK | present and valid |
| Missing | required, no value, no default — error |
| Default | optional/defaulted and unset — uses the schema default |
| Invalid | present but fails Zod (the message is shown; coercion hints included) |
| Unknown | present in the file, not in the schema — offered for removal |
| Encrypted | secret value stored as a `encrypted:v1:` envelope |
| Plaintext ⚠ | secret stored as plaintext — encrypt it from the banner |

## Editing & secrets

All edits go through the VSCode document model (`WorkspaceEdit`), so undo, redo, dirty state, and
save are native and nothing is written to disk until you save. The round-trip `.env` writer
preserves comments, blank lines, key order, quoting, and `export` prefixes.

Secrets are shown decrypted by default for seamless editing — the host decrypts them (never the
webview) when a private key is configured; **Hide secrets** in the banner masks them, and without a
key encrypted values stay masked. Editing a secret-marked key encrypts the value with the project's
public key (`.config/purenv-pub.key`, found by walking up to the nearest `package.json`, like core);
if no key exists yet, run `purenv keygen`. Writing a secret needs only the public key.

`secret: true` is a best-practice hint, not enforcement — `loadConfig` reads plaintext and encrypted
secrets alike. **Encrypt all plaintext secrets** in the banner sweeps every `.env` file across the
workspace in one undoable step.

## Build & develop

```sh
pnpm --filter @puristic/env build      # the extension bundles core's dist
pnpm --filter env build    # esbuild -> dist/, then tsc typecheck
pnpm --filter env test     # vitest (pure logic + subprocess integration)
```

Press <kbd>F5</kbd> with `_libs/vscode` open (configuration **Run Env Manager (fixtures)**) to
launch an Extension Development Host on `fixtures/`, then open `fixtures/api/.env`.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `puristic.nodePath` | `node` | Node 24+ binary used to evaluate config files (must support TS type-stripping — **not** the editor's Electron node) |
| `puristic.configFileGlob` | `**/env.config.{ts,mts,cts,js,mjs,cjs}` | config discovery |
| `puristic.envFileGlob` | `**/.env*` | `.env` discovery |
| `puristic.exclude` | node_modules/dist/.cache/.turbo/.git | discovery excludes |
| `puristic.configHostTimeoutMs` | `10000` | per-request subprocess timeout |

## Architecture

- **Pure logic** (`src/host/{detectPuristic,discovery,editor/envText,model}`) — no `vscode`
  import, unit-tested with vitest.
- **Config-host subprocess** (`src/host/configHost`) — a forked Node 24 process over IPC. Your
  config code runs only here, never in the extension host.
- **Editor** (`src/host/editor/envEditorProvider.ts`) — a `CustomTextEditorProvider` that builds
  the whole-project landscape and wires the webview.
- **Webview** (`src/webview`) — vanilla TS + esbuild, themed entirely with `--vscode-*` variables
  under a strict, nonce'd CSP.
