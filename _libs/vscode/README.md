# puristic

A VSCode extension that turns `.env` files into a managed, validated UI driven by your
[`@puristic/env`](../core) configuration schema.

When a workspace uses puristic, opening any `.env` file replaces the raw text editor with a
management panel: a **sidebar** of every directory that contains `.env` files (with aggregate
status badges), a **key-value grid** grouped by your nested schema, and a cross-service
**overview matrix**. Missing, invalid, unknown, and secret variables are signalled inline, with
full read/write editing and one-click secret encryption.

## How it knows your variables

The extension never guesses. It evaluates a **convention file** — `env.config.ts`
(`.mts`/`.cts`/`.js`/`.mjs`/`.cjs`) at a service/package root — in a short-lived Node 24
subprocess and asks `@puristic/env` (`inspectSchema` / `validateValues`) for the exact set
of expected variables, their types, defaults, secret flags, and live validation.

The config file must export the **raw `ConfigDefinition`** (schema + sources) — not
`defineConfig(...)`, which loads immediately and would fail on encrypted secrets:

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

A `default`, `config`, `definition`, or bare `schema` export is accepted. Each `.env` directory is
associated with its **nearest ancestor** `env.config.*`.

Schema path → env var follows core's rule: `["server","httpsPort"]` → `SERVER_HTTPS_PORT`.

## Status model

| Status | Meaning |
| --- | --- |
| OK | present and valid |
| Missing | required, no value, no default — error |
| Default | optional/defaulted and unset — uses the schema default |
| Invalid | present but fails Zod (the message is shown; coercion hints included) |
| Unknown | present in the file, not in the schema — offered for removal |
| Encrypted 🔒 | secret value stored as a `encrypted:v1:` envelope (reveal needs a private key) |
| Plaintext ⚠ | secret stored as plaintext — one click to encrypt |

## Editing & secrets

All edits go through the VSCode document model (`WorkspaceEdit`), so undo/redo/dirty/save are
native and nothing is written to disk until you save. The round-trip `.env` writer preserves
comments, blank lines, key order, quoting, and `export` prefixes.

Editing a secret-marked key encrypts the value with the project's public key
(`.config/puristic-pub.key`, resolved by walking up to the nearest `package.json`, mirroring
core). If no key exists, run `puristic keygen`. Encryption needs only the public key; the
private key is never required to write. Revealing an encrypted value decrypts in the extension
host (never the webview) and requires a configured private key.

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
- **Config-host subprocess** (`src/host/configHost`) — forked Node 24 over IPC; user code runs
  only here, never the extension host.
- **Editor** (`src/host/editor/envEditorProvider.ts`) — a `CustomTextEditorProvider` that builds
  the whole-project landscape and wires the webview.
- **Webview** (`src/webview`) — vanilla TS + esbuild, themed entirely with `--vscode-*` variables
  under a strict, nonce'd CSP.
