# @puristic/env-cli

**The `purenv` CLI: validate your `.env` files, generate types, and manage encrypted secrets — all from your [`@puristic/env`](https://www.npmjs.com/package/@puristic/env) Zod schema.**

For each `.env` file, `purenv` reads the `env.config.*` that governs it — the same definition your app loads at runtime and the [VSCode extension](https://github.com/radarsu/puristic-env/tree/main/_libs/vscode) edits. So CI validation, generated types, and the editor can't drift.

## Install

```sh
pnpm add -D @puristic/env-cli zod   # or run ad-hoc: npx @puristic/env-cli validate
```

Requires **Node 24+** and `zod` v4 (it evaluates your TypeScript `env.config.*` via native type-stripping).

## Commands

| Command | What it does |
| --- | --- |
| `purenv validate [files…]` | Validate `.env` files against their `env.config` schema. Reports ok / missing-required / using-default / invalid / unknown / secret-* per variable, and exits non-zero on errors. Flags: `--strict` treats unknown keys as errors, `--json` emits a machine-readable report, `--config <path>` overrides nearest-ancestor discovery. Defaults to all `.env*` under the cwd. |
| `purenv gen` | Generate `purenv.d.ts` (a typed `NodeJS.ProcessEnv` augmentation plus a `PuristicConfig` interface) and `.env.example` from the schema. Flags: `--json` also writes `purenv.schema.json`, `--types` / `--example` select individual artifacts, plus `--out <dir>` / `--config <path>` / `--force`. |
| `purenv run -- <cmd> [args…]` | Load `.env` (then `.env.local`), decrypt secrets, expand `$VAR` / `${VAR}` references, and run the command with those variables injected. Flags: `--env <file>` (repeatable) picks files, `--defaults` injects schema defaults, `--print` emits `export KEY=value` lines for `eval`. |
| `purenv keygen` | Generate an ML-KEM-512 keypair, write the public key to `.config/purenv-pub.key` (commit it), and print the private key with storage instructions. |
| `purenv encrypt <value>` | Encrypt one plaintext value to the project public key. Prints the `encrypted:v1:…` envelope. |
| `purenv encrypt-all <files…>` | Encrypt every plaintext secret value (keys marked `.meta({ secret: true })`) in place, preserving comments/order/quoting. Needs only the public key. |
| `purenv decrypt <envelope>` | Decrypt a single `encrypted:v1:…` envelope (needs the private key). |
| `purenv rotate <files…>` | Mint a fresh keypair, re-encrypt every secret in the files to the new key, and overwrite the public key — how you revoke access. |

## Examples

Gate CI / pre-commit on a valid environment:

```sh
purenv validate --strict
```

Run a command with a fully resolved, decrypted environment:

```sh
purenv run --env .env --env .env.local -- node ./dist/server.js
```

## Learn more

- **[Full project README](https://github.com/radarsu/puristic-env#readme)** — overview, security model, and getting started
- **[`@puristic/env`](https://www.npmjs.com/package/@puristic/env)** — the configuration loader this CLI is built on

## License

MIT
