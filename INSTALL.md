# INSTALL.md

**English** · [Português](./INSTALL.pt-BR.md)

This guide is written for a coding agent. A human told you: "go to the Mimeograph repository and follow INSTALL.md". Follow it literally, in order. Mimeograph source: `https://github.com/seatrunk/mimeograph.git`.

## Hard rules

These apply to every step. If a step would break one, stop and ask the human.

1. No `curl | sh`, no piping a download into a shell, no running a script you have not read.
2. No global installs (`npm -g`, `corepack enable`, `brew`, `apt`, version managers, and similar) without asking first.
3. No secrets. Never ask for, read, print or write tokens, passwords or `.env` files. If git needs credentials you do not have, stop and tell the human.
4. Ask the human before: overwriting or deleting any file that existed before you started; creating or changing anything under `.github/` or any CI setting or repository variable; running any `git push` or creating a remote repository.
5. Touch only the target directory and the temporary directory you create. Nothing else.

A file you copied into the target during this run is not a "file that existed before you started". Anything already in the target before step 4 is.

Every step has a **Skip if** (already done) and a **Check**. If the check fails after you ran the step, stop and show the human the command and its output. Shell variables do not survive between commands in some tools, so set them again in each command.

## Step 1. Choose the path

Ask the human which one they want:

- **A. New project**: create a new directory from the template. Continue with step 2.
- **B. Existing repository**: add the cage to a repository that already has files or history.

If the answer is **B**: adding Mimeograph to an existing repository is not supported yet. It is tracked in https://github.com/seatrunk/mimeograph/issues/2. Tell the human that, make no changes, and stop. Do not try to improvise it.

If the human only says "install it" and the current directory already has files or a `.git`, ask; do not assume.

## Step 2. Check the tools

```sh
git --version
node -p "process.versions.node.split('.')[0] >= 24"
pnpm --version
```

Check: `git` and `pnpm` print a version, and the `node` line prints `true`.

If something is missing or Node is older than 24, stop and tell the human what is missing. Do not install it yourself (hard rule 2); ask how they want it installed.

## Step 3. Ask for the name and the directory

Ask the human for:

- the **project name**: lowercase letters, digits and hyphens, starting with a letter. Check: `printf '%s' "$NAME" | grep -Eq '^[a-z][a-z0-9-]*$'`;
- the **target directory**, default `./$NAME` under the current directory.

Check the target:

```sh
if [ ! -e "$TARGET" ] || [ -z "$(ls -A "$TARGET")" ]; then echo ok-empty; else echo not-empty; fi
```

- `ok-empty`: continue with step 4.
- `not-empty` and it already holds a previous run of this guide (`$TARGET/sgconfig.yml` exists and `node -p "require('$TARGET/package.json').name"` prints `$NAME` or `mimeograph`): skip step 4 and continue with step 5.
- `not-empty` otherwise: stop and ask the human for another directory. Do not copy over it.

## Step 4. Copy the template

**Skip if** step 3 found a previous run.

```sh
TMP="$(mktemp -d)"
git clone --depth 1 https://github.com/seatrunk/mimeograph.git "$TMP/mimeograph"
mkdir -p "$TARGET"
git -C "$TMP/mimeograph" archive HEAD | tar -x -C "$TARGET"
rm -r "$TMP"
```

`git archive` copies the files without the `.git` history. Use the branch or tag the human names with `git clone --depth 1 --branch <ref> ...`; otherwise use the default branch.

If `git clone` fails because the repository is private or you have no access, stop and tell the human. Do not ask for tokens (hard rule 3).

Check:

```sh
test -f "$TARGET/sgconfig.yml" && test -d "$TARGET/rules/core" && test ! -e "$TARGET/.git" && echo ok
```

## Step 5. Strip the template-only files

These belong to Mimeograph itself, not to the new project. In `$TARGET`:

```sh
cd "$TARGET"
rm -f README.pt-BR.md INSTALL.md INSTALL.pt-BR.md docs/assets/logo-mark.svg docs/assets/logo-wordmark.svg
if [ -d docs/assets ]; then rmdir docs/assets; fi
```

Keep `LICENSE`, `.github/`, `AGENTS.md`, `docs/features/`, `docs/limits*.md` and the example features. Do not edit `.github/workflows/ci.yml` (hard rule 4).

Then replace `README.md` with this text (use `$NAME`):

```md
# <name>

Built on the Mimeograph cage. Run `pnpm check` before every commit; CI runs the same command. Rules for agents are in [AGENTS.md](./AGENTS.md).
```

**Skip if** the first line of `README.md` is already `# $NAME`.

Check:

```sh
test ! -e INSTALL.md && test ! -e README.pt-BR.md && test ! -d docs/assets && head -1 README.md
```

The last command must print `# ` followed by the project name.

## Step 6. Rename the project

In `package.json`, change the `"name"` field from `mimeograph` to `$NAME`. In `AGENTS.md`, change the first line from `# AGENTS.md (Mimeograph)` to `# AGENTS.md`. Edit only those two lines.

**Skip if** already done.

Check:

```sh
node -p "require('./package.json').name"
head -1 AGENTS.md
```

The first prints `$NAME`; the second prints `# AGENTS.md`.

## Step 7. Start a git repository

```sh
git -C "$TARGET" rev-parse --show-toplevel
```

- It fails: run `git -C "$TARGET" init -b main`.
- It prints `$TARGET` (resolved path): already done, skip.
- It prints another directory: `$TARGET` is inside a different repository. Stop and ask the human.

Do not commit and do not add a remote. Leave that to the human.

Check: `git -C "$TARGET" rev-parse --show-toplevel` prints `$TARGET`.

## Step 8. Install dependencies

```sh
cd "$TARGET"
pnpm install --frozen-lockfile
```

This downloads packages from the npm registry and runs the install script of `@ast-grep/cli`, the only one allowed in `pnpm-workspace.yaml`. Re-running is safe.

Check: the command exits 0 and `test -d node_modules` succeeds.

## Step 9. Run the gate

```sh
cd "$TARGET"
pnpm check
```

Check: exit code 0. This is the definition of done.

If it fails:

- At the Prettier step only: run `pnpm format`, then `pnpm check` again.
- Anything else: do not edit `rules/`, `tests/` or the tool configs to make it pass, and do not delete or weaken a test. Stop and show the human the failing step and its output.

## Step 10. Report to the human

Send a short message with these lines filled in:

```text
Mimeograph installed in <TARGET>.
- project name: <NAME>
- pnpm check: green (exit 0)
- git: initialized on main, nothing committed, nothing pushed, no remote
- CI: .github/workflows/ci.yml copied unchanged. It runs on ubuntu-latest unless the repository variable CI_RUNS_ON is set (https://github.com/seatrunk/mimeograph/blob/main/README.md#ci-runner)
- license: LICENSE kept as copied (MIT, copyright 2026 seatrunk); decide if your project needs a different one
- examples: src/features/example-a and example-b and docs/features/example-flow.md kept; delete them when you have your first real feature
- needs you: first commit, remote, push, CI variable
```

Add any step you skipped and why. Then stop.

## Safety note for humans

What the agent will do:

- ask you for the project name and directory, and which path you want;
- download this repository with `git clone` and nothing else from the network except the npm packages in the lockfile;
- create files only inside the directory you chose, run `git init` there, run `pnpm install --frozen-lockfile` and `pnpm check`;
- tell you exactly what it did and what is left for you.

What the agent will not do:

- install anything globally, pipe a download into a shell, or ask for or touch tokens, passwords and `.env` files;
- write into a directory that already has files, or overwrite or delete anything that was there;
- change CI, set repository variables or settings, create a remote repository, commit or push;
- apply Mimeograph to an existing repository (not supported yet, see issue #2);
- weaken a rule or a test to get `pnpm check` green.

If an agent does any of the second list, stop it.
