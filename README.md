# puristic

**One TypeScript config schema, reused everywhere — to load config in your app, validate `.env` files in CI, and edit them in a typed VSCode UI.**

> **Status:** early / WIP. The API is still settling, but the loader and the VSCode extension both work today.

puristic is two tools built on **one source of truth** — your config schema:

1. **[`@puristic/env`](_libs/core)** — the config loader. It merges CLI flags, environment variables, and `.env` files (in that order of precedence), validates them against a Zod schema, and decrypts secrets.
2. **the [VSCode extension](_libs/vscode)** ("Puristic Env Manager") — reads that same schema and replaces the raw `.env` text editor with a typed, validated UI. Missing, invalid, unknown, and secret variables are flagged inline, and you can edit values or encrypt secrets in one click.

Your app and the editor load the same `ConfigDefinition`, so they can't drift.

## Why it's different

**One schema, used everywhere.** You write your config as a normal Zod schema in `env.config.ts`. puristic reads the schema straight from that file — types, defaults, and secret flags included — by running it in a short-lived Node 24 subprocess (via native TypeScript type-stripping). That one definition then drives everything: config loading in your app, `purenv validate` in CI, generated types and `.env.example`, and the VSCode editor. There's no separate DSL to keep in sync and no cloud API to call, so nothing can drift.

**A typed `.env` editor.** Open any `.env` in VSCode and the **Puristic Env Manager** replaces raw text with type-aware inputs (number, url, enum, bool), grouped by your nested schema. Every variable gets an inline OK / Missing / Invalid / Unknown status. A **cross-service matrix** shows which variables are present, missing, or invalid in each `.env` across a monorepo.

| Capability | puristic | Syntax exts (DotENV) | GUI editors (Visual Env) | Schema tools (varlock) | Cloud mgrs (Doppler/Infisical) |
|---|:--:|:--:|:--:|:--:|:--:|
| Validates against **your project's real typed TS schema** (live), not a DSL or cloud | ✓ | ✗ | ✗ | ◐ | ✗ |
| **One schema** drives runtime, CI, codegen **and** the editor | ✓ | ✗ | ✗ | ◐ | ◐ |
| Replaces the editor with **typed inputs** (number/url/enum/bool) | ✓ | ✗ | ◐ | ✗ | ✗ |
| **Cross-service** present/missing/invalid matrix | ✓ | ✗ | ✗ | ✗ | ✗ |

<sub>✓ yes · ◐ partial (varlock's schema is an in-file DSL; Visual Env infers types heuristically) · ✗ no</sub>

Local, in-file secret encryption is a bonus, not the headline — see [Secrets & security](#secrets--security).

### Compared to varlock

[varlock](https://varlock.dev) (by dmno-dev) is the closest tool in spirit: it also brings types, validation, and secrets to `.env`. The difference is where the schema lives. varlock attaches it to the `.env` file itself, through the **`@env-spec` DSL** — JSDoc-style decorators (`@type`, `@required`, `@sensitive`) written in comments. It's a polished, batteries-included tool: AI-safe schemas (agents read the schema, never the values), leak scanning (`varlock scan` plus git hooks), secret-manager plugins (1Password, AWS, Azure, GCP, Infisical, Bitwarden), and device-bound encryption backed by platform hardware (Secure Enclave / TPM). Native in-file shared-key encryption is on its roadmap. If you want decorators-in-`.env` plus hosted secret backends, varlock is an excellent choice.

puristic takes a different approach. The schema is plain Zod TypeScript that your app already imports at runtime, not a DSL to learn or a parallel file to maintain. That same definition also powers the typed editor and committed, post-quantum-encrypted secrets, with no cloud or secret-manager dependency. Choose puristic if you want your TypeScript schema to *be* the config contract everywhere: app, CI, codegen, and editor.

## How it works

Define your configuration once. Export the **raw `ConfigDefinition`** (schema + sources), not the result of `loadConfig(...)`. `loadConfig` loads immediately, so it would fail on encrypted secrets without a key:

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

Nested schema paths map to env var names: `["server", "httpsPort"]` → `SERVER_HTTPS_PORT` (and `--server-https-port` for CLI flags). So the config above expects:

```sh
# .env
NODE_ENV=production
SERVER_PORT=8080
SERVER_HOST=0.0.0.0
DATABASE_URL=encrypted:v1:…        # secret — encrypted in place
```

Open that `.env` in VSCode and the **Puristic Env Manager** takes over. It shows a sidebar of every directory with `.env` files (each with an aggregate status badge), a key-value grid grouped by your nested schema with type-aware inputs, and a cross-service overview matrix. Each variable shows its status:

| Status | Meaning |
| --- | --- |
| OK | present and valid |
| Missing | required, no value, no default — error |
| Default | optional/defaulted and unset — uses the schema default |
| Invalid | present but fails Zod (the message and coercion hints are shown) |
| Unknown | present in the file, not in the schema — offered for removal |
| Encrypted | secret stored as an `encrypted:v1:` envelope (reveal needs a private key) |
| Plaintext ⚠ | secret stored as plaintext — one click to encrypt |

Edits go through VSCode's document model, so undo/redo/dirty/save are native and nothing hits disk until you save. The round-trip `.env` writer preserves comments, blank lines, key order, quoting, and `export` prefixes.

## Packages

| Package | Description |
| --- | --- |
| [`@puristic/env`](_libs/core) | The config loader. Merges `cliArgs` / `env` / `envFile` sources, validates against a Zod schema, introspects it (`inspectSchema` / `validateValues`), and encrypts/decrypts secrets. |
| [`@puristic/env-cli`](_libs/cli) | The `purenv` command line: `validate` (CI / pre-commit), `gen` (typed `.d.ts` / `.env.example` / JSON Schema), `keygen`, `encrypt` / `encrypt-all`, `rotate`, and `decrypt`. |
| [`puristic`](_libs/vscode) | The VSCode extension ("Puristic Env Manager"), the schema-driven `.env` editor. See its [README](_libs/vscode/README.md) for settings and architecture. |

## Secrets & security

Mark a field secret with `.meta({ secret: true })`. The editor (and `purenv encrypt`) encrypt its value **in place**, using the project's **public** key (`.config/purenv-pub.key`, found by walking up to the nearest `package.json`). The result is an `encrypted:v1:…` envelope sealed with **ML-KEM-512** (a post-quantum KEM) and **AES-256-GCM**. Writing a secret needs only the public key, so anyone on the team can do it. Revealing or loading a secret needs the **private** key.

Generate a keypair with:

```sh
purenv keygen
```

Committing a public key and encrypting in place was popularized by [dotenvx](https://dotenvx.com). puristic's twist: the cipher is **post-quantum**, and the secret flags come from the same schema that validates everything else. The model is **fully local** — no accounts, no cloud, with secrets committed (encrypted) next to your code. The team shares one private key, distributed out of band. Run `purenv encrypt-all` to seal every plaintext secret in a file. To revoke access when someone leaves, run `purenv rotate`: it mints a new keypair and re-encrypts everything. The trade-off versus a cloud secret manager (Doppler, Infisical, 1Password, EnvKey) is no central audit log and no per-member access control.

## Command line

```sh
purenv validate [files…]   # check .env files against the schema; non-zero exit on errors (CI)
purenv gen                 # write purenv.d.ts + .env.example (+ --json for JSON Schema)
purenv keygen              # generate the project keypair
purenv encrypt <value>     # encrypt one value to the project public key
purenv encrypt-all <file>  # encrypt every plaintext secret in a .env file
purenv rotate <files…>     # re-key: new keypair, re-encrypt all secrets
purenv decrypt <value>     # decrypt one envelope (needs the private key)
```

`validate` runs the same check as the editor, so one schema gates CI and pre-commit hooks too. `gen` turns that schema into typed `process.env` and an onboarding `.env.example`.

## Getting started

```sh
pnpm install
pnpm build            # turbo: build core, cli, and the extension
pnpm test
pnpm libs:watch       # incremental TypeScript build in watch mode
```

To run the extension from source, open [`_libs/vscode`](_libs/vscode) and press <kbd>F5</kbd> (launch configuration **Run Env Manager (fixtures)**). That starts an Extension Development Host on the bundled `fixtures/`; open `fixtures/api/.env` there.

> Requires **Node 24**. The extension evaluates your config with native TypeScript type-stripping, so set `puristic.nodePath` if your editor's runtime isn't Node 24+.

## License

MIT
