# puristic

**Type-safe configuration whose schema also powers a validated, typed `.env` manager for VSCode.**

> **Status:** early / WIP — the package surface is still being designed, but the core loader and the VSCode extension both work today.

puristic is two things that share **one source of truth**:

1. **[`@puristic/env`](_libs/core)** — a Zod-schema configuration loader that merges CLI flags, environment variables, and `.env` files with predictable precedence, validates them, and encrypts secrets.
2. **the [VSCode extension](_libs/vscode)** ("Puristic Env Manager") — which reads *that same schema* and replaces the raw `.env` text editor with a typed, validated management UI: missing, invalid, unknown, and secret variables are flagged inline, with full editing and one-click secret encryption.

Because the editor and your running app load the same `ConfigDefinition`, they can never drift.

## Why it's different

Most `.env` tooling falls into one of five buckets — syntax highlighters, GUI key/value editors, schema linters, in-file encryptors, and cloud secret managers. Here is how puristic compares to the strongest example of each:

| Capability | puristic | Syntax exts (DotENV) | GUI editors (Visual Env) | Schema linter (varlock) | Encryption (dotenvx) | Cloud mgrs (Doppler/Infisical) |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Validates values against **your project's** typed schema | ✅ | ❌ | ❌ | ◐ | ❌ | ❌ |
| Reads your **real TS config** (live schema), not a separate file | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Replaces the editor with **typed inputs** (number/url/enum/bool) | ✅ | ❌ | ◐ | ❌ | ❌ | ❌ |
| **Cross-service** present/missing/invalid matrix | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| In-file encrypted secrets, **no cloud account** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Post-quantum** encryption (ML-KEM-512 + AES-256-GCM) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **One schema** for app runtime **and** editor | ✅ | ❌ | ❌ | ◐ | ❌ | ◐ |

<sub>✅ yes · ◐ partial (varlock's schema is an in-file DSL; Visual Env infers types heuristically) · ❌ no</sub>

The difference isn't any single row — it's that puristic reads your **real** configuration. A short-lived Node 24 subprocess evaluates your actual `env.config.ts` (via native TypeScript type-stripping) and asks `@puristic/env` for the live schema — types, defaults, constraints, enums, and secret flags — instead of parsing a separate DSL or calling a cloud API. Everything else is built on that: schema-typed inputs, the OK / Missing / Invalid / Unknown status taxonomy, and a matrix that shows, across every `.env` in a monorepo, which variables are present, missing, or invalid per service.

The one thing puristic doesn't claim to have invented is **local public-key `.env` encryption** — [dotenvx](https://dotenvx.com) popularized committing a public key and encrypting in place. puristic's twist is that the cipher is **post-quantum** and the secret flags come from the same schema that validates everything else. It is fully local with no SaaS — which also means no built-in team sync (see [Secrets & security](#secrets--security)).

## How it works

Define your configuration once. Export the **raw `ConfigDefinition`** (schema + sources) — not `defineConfig(...)`, which loads immediately and would fail on encrypted secrets without a key:

```ts
// env.config.ts — the single source of truth
import { type ConfigDefinition, envFile, env, cliArgs } from "@puristic/env/index.js";
import { z } from "zod";

export default {
    schema: z.object({
        nodeEnv: z.string(),
        server: z.object({
            port: z.coerce.number().int(),
            host: z.string().default("0.0.0.0"),
        }),
        database: z.object({
            url: z.url().meta({ secret: true }),
        }),
    }),
    sources: [envFile(".env"), env(), cliArgs()], // later sources win: CLI > env > .env file
} satisfies ConfigDefinition<z.ZodType>;
```

Load it in your app at runtime — validated, secrets decrypted, deep-frozen:

```ts
import { createConfig } from "@puristic/env/index.js";
import definition from "./env.config.js";

const config = createConfig(definition).load();
config.server.port; // number
```

Nested schema paths map to env var names by core's rule — `["server", "httpsPort"]` → `SERVER_HTTPS_PORT` (and `--server-https-port` for CLI flags). So the config above expects:

```sh
# .env
NODE_ENV=production
SERVER_PORT=8080
SERVER_HOST=0.0.0.0
DATABASE_URL=encrypted:v1:…        # secret — encrypted in place
```

Open that `.env` in VSCode and the **Puristic Env Manager** takes over: a sidebar of every directory with `.env` files (with aggregate status badges), a key-value grid grouped by your nested schema with type-aware inputs, and a cross-service overview matrix. Each variable shows its status:

| Status | Meaning |
| --- | --- |
| OK | present and valid |
| Missing | required, no value, no default — error |
| Default | optional/defaulted and unset — uses the schema default |
| Invalid | present but fails Zod (the message and coercion hints are shown) |
| Unknown | present in the file, not in the schema — offered for removal |
| Encrypted 🔒 | secret stored as an `encrypted:v1:` envelope (reveal needs a private key) |
| Plaintext ⚠ | secret stored as plaintext — one click to encrypt |

Edits go through VSCode's document model, so undo/redo/dirty/save are native and nothing hits disk until you save. The round-trip `.env` writer preserves comments, blank lines, key order, quoting, and `export` prefixes.

## Packages

| Package | Description |
| --- | --- |
| [`@puristic/env`](_libs/core) | The configuration loader: merge `cliArgs`/`env`/`envFile` sources with precedence, validate against a Zod schema, introspect it (`inspectSchema` / `validateValues`), and encrypt/decrypt secrets. |
| [`@puristic/env-cli`](_libs/cli) | The `puristic` CLI: `validate` (CI / pre-commit), `gen` (typed `.d.ts` / `.env.example` / JSON Schema), `keygen`, `encrypt` / `encrypt-all`, `rotate`, and `decrypt`. |
| [`puristic`](_libs/vscode) | The VSCode extension ("Puristic Env Manager") — the schema-driven `.env` editor. See its [README](_libs/vscode/README.md) for settings and architecture. |

## Secrets & security

Mark a field secret with `.meta({ secret: true })`. The editor (and `puristic encrypt`) encrypt its value **in place** with the project's **public** key (`.config/puristic-pub.key`, resolved by walking up to the nearest `package.json`), producing an `encrypted:v1:…` envelope using **ML-KEM-512** (a post-quantum KEM) + **AES-256-GCM**. Encryption needs only the public key, so anyone on the team can write secrets; revealing or loading them requires the **private** key.

Generate a keypair with:

```sh
puristic keygen
```

This is a **fully local** model — no accounts, no cloud, secrets committed (encrypted) alongside your code. The team shares one private key (distributed out of band); `puristic encrypt-all` seals every plaintext secret in a file, and `puristic rotate` mints a new keypair and re-encrypts everything — that's how you revoke access when someone leaves. The trade-off versus a cloud secret manager (Doppler, Infisical, 1Password, EnvKey) is no central audit log or per-member access control.

## Command line

```sh
puristic validate [files…]   # check .env files against the schema; non-zero exit on errors (CI)
puristic gen                 # write puristic-env.d.ts + .env.example (+ --json for JSON Schema)
puristic keygen              # generate the project keypair
puristic encrypt <value>     # encrypt one value to the project public key
puristic encrypt-all <file>  # encrypt every plaintext secret in a .env file
puristic rotate <files…>     # re-key: new keypair, re-encrypt all secrets
puristic decrypt <value>     # decrypt one envelope (needs the private key)
```

`validate` runs the same check as the editor, so the schema gates CI and pre-commit hooks too; `gen` turns the one schema into typed `process.env` and an onboarding `.env.example`.

## Getting started

```sh
pnpm install
pnpm build            # turbo: build core, cli, and the extension
pnpm test
pnpm libs:watch       # incremental TypeScript build in watch mode
```

To run the extension from source, open [`_libs/vscode`](_libs/vscode) and press <kbd>F5</kbd> (launch configuration **Run Env Manager (fixtures)**) to start an Extension Development Host on the bundled `fixtures/`, then open `fixtures/api/.env`.

> Requires **Node 24** (the extension evaluates your config with native TypeScript type-stripping; set `puristic.nodePath` if your editor's runtime isn't Node 24+).

## License

MIT
