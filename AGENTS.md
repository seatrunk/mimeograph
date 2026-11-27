# AGENTS.md (Mimeograph)

## Commands

- `pnpm check`: full gate (format, oxlint, ast-grep scan and test, typecheck, knip, test). Fails on the first error.
- `pnpm format`: applies Prettier. `pnpm test`: Vitest. `pnpm typecheck`: `tsc --noEmit`.

## Adoption mode

With `adoption/baseline.json`, `pnpm ast` accepts only the old violations already recorded in files you have not touched. A new or changed file is strict. The baseline only shrinks: run `pnpm adoption:update` after cleaning up a file, never edit the JSON by hand. Details in `docs/adoption.md`.

## Hard rules

- Zero comments in any TS/JS file in the repository. Only exception: `/// <reference types="..." />` or `lib="..."`, without a relative path.
- No `any`. No empty `catch` or one that swallows the error. `useEffect` only in `src/shared/effects/**`.
- No weakened tests (do not delete or relax an assert to make it pass).
- No merge and no push to `main`. No secrets in the repo.

## Feature boundaries

- `src/features/<name>/index.ts` is the only public entry point of a feature.
- Another feature only via `#features/<name>`; common code via `#shared/<file>`.
- Inside a feature, relative imports only with `./`. `src/shared` does not import from features.

## Second-error rule

An error flagged 2x in review becomes a rule in `rules/segundo-erro/`, with a test in `rules/__tests__/` and a `message` saying the right way.

## Feature Map

Every screen or flow has a `.md` in `docs/features/` (format in `docs/features/README.md`). Read it before changing anything; update it together with the change.
