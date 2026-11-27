<p align="center"><img src="docs/assets/logo-wordmark.svg" alt="Mimeograph" width="520"></p>

> Copy the cage, not the mistakes.

Mimeograph is a repository template: strict TypeScript on Node, no UI framework, and a mechanical cage that fails the build when a rule is broken. You copy the cage into a new project once, and every later change, human or coding agent, runs through the same gate.

## What the cage blocks

`pnpm check` runs, in order, and stops at the first failure:

- **Prettier** (format only) and **Oxlint** (correctness, `no-explicit-any`, no shadowing, no import cycles).
- **ast-grep rules** in `rules/`:
  - any comment in TS/JS (except `/// <reference types|lib="..." />`);
  - a `catch` that swallows the error instead of rethrowing or returning it;
  - `useEffect` and friends outside `src/shared/effects/**`;
  - feature boundaries: imports through `#features/<name>` only, no `..` inside a feature, `src/shared` never imports a feature;
  - computed `import()` / `require()` specifiers, hex/unicode string escapes, and shadowing native error names, all of which hide text from the rules above.
- **ast-grep rule tests**, `tsc --noEmit` (strict), **knip** (orphan exports, files and dependencies) and **Vitest**, which includes attack probes that try to bypass the rules.

The rules and the docs that explain them are in [AGENTS.md](./AGENTS.md) and [docs/features](./docs/features/README.md). Their messages are in Portuguese for now.

## Quick start

With a coding agent: tell it _"go to https://github.com/seatrunk/mimeograph and follow INSTALL.md"_. The guide for agents is [INSTALL.md](./INSTALL.md); it asks before overwriting files, changing CI or pushing.

By hand (Node >= 24 and pnpm; the pnpm version is pinned in `packageManager`):

```sh
git clone https://github.com/seatrunk/mimeograph.git
cd mimeograph
pnpm install --frozen-lockfile
pnpm check
```

Delete `src/features/example-a`, `src/features/example-b` and `docs/features/example-flow.md` when you have your first real feature. Run `pnpm check` before every commit; CI runs the same command.

## CI runner

`.github/workflows/ci.yml` uses:

```yaml
runs-on: ${{ fromJSON(vars.CI_RUNS_ON || '"ubuntu-latest"') }}
```

Without the `CI_RUNS_ON` repository variable, CI runs on `ubuntu-latest`. To use a self-hosted runner, set the variable to a JSON list of runner labels:

```sh
gh variable set CI_RUNS_ON --repo <owner>/<repo> --body '["self-hosted","Linux","X64","my-runner"]'
```

Or in GitHub: Settings, Secrets and variables, Actions, Variables. The value must be valid JSON and the labels must match an online runner, otherwise jobs fail or wait forever. Do not attach a self-hosted runner to a public repository you do not control.

## Limits

The cage is syntactic and covers what it lists, nothing more. See [docs/limits.md](./docs/limits.md) for what the rules declaredly do not catch.

## License

[MIT](./LICENSE), copyright 2026 seatrunk.
