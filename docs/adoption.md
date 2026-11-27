# Adoption mode

How to put the cage on a repository that already has code, without fixing everything on day one and without letting it get worse. The agent procedure is in [INSTALL.md](../INSTALL.md) (path B); this page is the design.

## What it covers

Adoption mode applies to the ast-grep rules in `rules/` (comments, swallowed `catch`, `useEffect`, feature boundaries, computed import specifiers and the rest). It does not impose the template's Prettier, Oxlint, `tsconfig.json`, knip or Vitest probes on an existing repository; that repository keeps its own tooling. `pnpm ast` is the only command whose behavior changes.

## Modes

- **Strict** (no `adoption/baseline.json`): `pnpm ast` is a plain `ast-grep scan`. This is the template's default and what a new project gets.
- **Adoption** (`adoption/baseline.json` exists): `pnpm ast` runs the scan, then judges every violation by whether its file is new or changed.

Deleting the baseline returns the repository to strict mode, which is never weaker.

## Baseline format

`adoption/baseline.json`, committed:

```json
{
  "version": 1,
  "violations": {
    "src/legacy/a.ts": { "no-comments": 2, "no-swallowed-catch": 1 },
    "src/legacy/b.ts": { "no-comments": 1 }
  }
}
```

- One entry per file and rule id, with the number of violations the scan reports today. Counts, not line numbers, so the baseline does not break when unrelated code moves. A baselined file is by definition untouched, so its count is exact.
- Keys are sorted and the file is written with two-space JSON, so it is stable under Prettier and diffs show only real changes.
- Every count is a positive integer; an unknown key, version or shape is an error, not a pass.

Commands:

- `pnpm adoption:init` writes the baseline from the current scan. It refuses to run when the file already exists.
- `pnpm adoption:update` rewrites the baseline as `min(baseline, current)` per file and rule and drops entries that reach zero. It never adds a file or a rule and never raises a count.
- `pnpm ast` is the gate.

## What counts as a changed file

A file is **changed** when it differs from the base, or is not tracked yet:

- the base is the merge-base of `HEAD` and the branch you merge into: `ADOPTION_BASE` if set, else `origin/$GITHUB_BASE_REF` in a CI pull request, else the first that exists of `origin/HEAD`, `origin/main`, `origin/master`, `main`, `master`;
- changed files are `git diff --name-only --no-renames --diff-filter=d <merge-base>` (committed, staged and unstaged work, against the base) plus the untracked files that are not ignored;
- a rename is a new path, so a renamed file is changed; the old path is deleted;
- if `HEAD` is the base itself, only the uncommitted work counts;
- if the base cannot be resolved (for example a shallow clone), the scan fails with a message; it never guesses.

The comparison is by content against the base, not by what the agent says it touched: whitespace, a mode change or a one-line edit all make the file changed, and a file edited and then restored is not changed.

## What the gate does in adoption mode

For every file and rule, with `n` violations now and `b` in the baseline:

| File      | Condition | Result                                                     |
| --------- | --------- | ---------------------------------------------------------- |
| changed   | `n > 0`   | **STRICT**: fails, the baseline gives no allowance         |
| unchanged | `n > b`   | **NEW**: fails, the baseline never grows                   |
| any       | `n < b`   | **STALE**: fails until `pnpm adoption:update` is committed |
| unchanged | `n = b`   | passes                                                     |

So new and changed files meet the full rules; untouched legacy files are held at exactly their recorded level; and when a legacy file is cleaned, the baseline has to be shrunk in the same change, which keeps the ratchet honest.

## How the baseline can only shrink

Three mechanisms, none of which relies on an agent behaving:

1. The tools cannot raise it: `init` refuses an existing file and `update` only takes the minimum.
2. A hand edit that raises an entry is caught against the base: the gate reads `adoption/baseline.json` at the merge-base and fails with **GROWTH** for any file and rule whose count is higher, or new, in the working tree. The exception is the pull request that introduces the baseline, because the base has none.
3. Raising a count to hide a new violation also fails the first two checks: the file is new or changed, so it is **STRICT**.

## CI

CI needs the history to find the base: `actions/checkout` with `fetch-depth: 0` (the template's `ci.yml` has it). The pull request base is read from `GITHUB_BASE_REF`; for any other setup, set `ADOPTION_BASE`. Node 24 or newer is required to run the tool (it is TypeScript run by Node).

## Limits

See [limits.md](./limits.md#existing-repositories).
