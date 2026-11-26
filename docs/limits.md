# Limits

**English** · [Português](./limits.pt-BR.md)

What the cage declaredly does not catch. Source: [AGENTS.md](../AGENTS.md), the messages in `rules/` and the bypass probes in `tests/gate.test.ts`.

## Rules are syntactic

- The ast-grep rules read syntax trees, not types or data flow. The boundary rules see only the text of the import specifier. That is why computed `import()` / `require()` specifiers, `createRequire`, `import.meta.resolve()` and hex/unicode escapes are banned: they would hide the text. Any other way to load code that is not on that list is not seen.
- `catch` is judged by the shape of its last statement: it must `throw` or `return` something that carries the error. The rule does not check that the caller handles it, and conditional fallbacks before that last statement are allowed.
- `useEffect` is matched by name. Code inside `src/shared/effects/**` is allowed to use it freely; nothing checks what those effects do.
- The rules that guard native error names and `Promise` trust those names are not shadowed, and the shadowing check only runs on `src/**`.

## Coverage

- The ast-grep rules run on `src/**`, except `no-comments`, which runs on every TS/JS file in the repository. The `tests/` folder is outside the catch, boundary and import rules.
- Only TS/JS comments are blocked. Comments in YAML, JSON, Markdown and other files are not.
- Prettier checks the file types it supports; other files (for example SVG) are not formatted or checked.

## Process rules are not mechanical

AGENTS.md also says: no weakened tests, no merge or push to `main`, no secrets in the repository, keep the Feature Map in `docs/features/` up to date. The gate does not enforce any of these. Protect `main` with GitHub branch protection and review.

## What the gate does not do

- It does not require a test for every feature and does not judge test quality; it runs the tests that exist.
- It does not audit dependencies for vulnerabilities and does not check runtime behavior or security.
- Rule messages, AGENTS.md and `docs/features/` are written in Portuguese for now.

## Existing repositories

The template is meant to be copied into a new project. Adding the cage to an existing repository is not supported yet; see [issue #2](https://github.com/seatrunk/mimeograph/issues/2).
