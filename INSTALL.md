# INSTALL.md

This guide is written for a coding agent. A human told you: "go to the Mimeograph repository and follow INSTALL.md". Follow it literally, in order. Mimeograph source: `https://github.com/seatrunk/mimeograph.git`.

## Hard rules

These apply to every step. If a step would break one, stop and ask the human.

1. No `curl | sh`, no piping a download into a shell, no running a script you have not read.
2. No global installs (`npm -g`, `corepack enable`, `brew`, `apt`, version managers, and similar) without asking first.
3. No secrets. Never ask for, read, print or write tokens, passwords or `.env` files. If git needs credentials you do not have, stop and tell the human.
4. Ask the human before: overwriting or deleting any file that existed before you started; changing `.github/workflows/ci.yml` after step 4, adding other files under `.github/`, or touching any CI setting or repository variable; running any `git push` or creating a remote repository.
5. Touch only the target directory. Nothing else.
6. If a safety tool or hook blocks a command, do not reword or split it to get around the block. Tell the human and ask.

A file you copied into the target during this run is not a "file that existed before you started". Anything already in the target before step 4 is. Step 4 copies the template's `.github/workflows/ci.yml` unchanged; that copy is part of the template and needs no question.

Steps that change something have a **Skip if** (already done) and every step ends with a **Check**. If the check fails after you ran the step, stop and show the human the command and its output. Shell variables and the current directory do not survive between commands in some tools, so set the variables again and `cd` again in each command.

Talk to the human in the human's language, including the final report in step 9: translate its labels too. Commands, file names, URLs and variable names stay as written.

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
if [ ! -e "$TARGET" ] || [ -z "$(ls -A "$TARGET")" ]; then
  echo ok-empty
elif [ "$(ls -A "$TARGET")" = ".git" ]; then
  if [ -L "$TARGET/.git" ] || [ ! -d "$TARGET/.git" ]; then
    echo dotgit-not-a-directory
  elif [ -z "$(ls -A "$TARGET/.git")" ]; then
    echo dotgit-empty
  elif [ "$(git -C "$TARGET" rev-parse --show-toplevel 2>/dev/null)" = "$(cd "$TARGET" && pwd -P)" ] && ! git -C "$TARGET" rev-parse --verify -q HEAD >/dev/null; then
    echo ok-git-only
  else
    echo not-empty
  fi
else
  echo not-empty
fi
```

- `ok-empty`: continue with step 4.
- `ok-git-only`: `$TARGET` holds only a valid git repository with no commits, which is what a previous attempt leaves when `git init` worked and `git fetch` failed. Continue with step 4.
- `dotgit-not-a-directory`: `.git` is a regular file or a symlink, as in a linked worktree or a submodule checkout that points at another repository. This is not a leftover of this guide. Stop, change nothing, tell the human what `.git` is, and ask for another directory.
- `dotgit-empty`: `.git` is an empty directory. `git init` never leaves that, so it is not a leftover of this guide. Stop, change nothing, tell the human, and ask whether to use another directory. Do not delete it yourself (hard rule 4).
- `not-empty` and it already holds a previous run of this guide (`$TARGET/sgconfig.yml` exists and the command below prints `$NAME` or `mimeograph`): skip step 4 and continue with step 5.
- `not-empty` otherwise: stop and ask the human for another directory. Do not copy over it.

```sh
node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).name" "$TARGET/package.json"
```

## Step 4. Create the repository and copy the template

**Skip if** step 3 found a previous run.

```sh
mkdir -p "$TARGET"
git -C "$TARGET" rev-parse --show-toplevel
```

- It fails: `$TARGET` is not in a git repository. Run `git init -b main "$TARGET"`.
- It prints `$(cd "$TARGET" && pwd -P)`: already a repository root, continue.
- It prints any other directory: `$TARGET` is inside a different repository. Stop and ask the human.

Then fetch the template into it. Use the branch or tag the human names in place of `HEAD`; otherwise take the default branch.

```sh
git -C "$TARGET" fetch --depth 1 https://github.com/seatrunk/mimeograph.git HEAD
git -C "$TARGET" archive FETCH_HEAD | tar -x -C "$TARGET"
```

`git archive` unpacks the files of the fetched commit into the directory without touching the index, so nothing is staged and nothing is committed; the files show up as untracked. There is no temporary directory and nothing to delete. Do not add a remote and do not commit; that is for the human.

If `git fetch` fails because the repository is private or you have no access, stop and tell the human. Do not ask for tokens (hard rule 3).

Check:

```sh
test -f "$TARGET/sgconfig.yml" && test -d "$TARGET/rules/core" && test -z "$(git -C "$TARGET" diff --cached --name-only)" && echo ok
git -C "$TARGET" rev-parse --show-toplevel
```

The first prints `ok`; the second prints the resolved `$TARGET`.

## Step 5. Strip the template-only files

These belong to Mimeograph itself, not to the new project. This step refuses to run when `TARGET` or `NAME` is not set, or when `$TARGET` is not the copied template, so that nothing is deleted in the wrong folder. The chain below stops at the first link that fails. If it does not print `step5-ok`, do not run anything else in this step, including the `README.md` replacement, and tell the human why.

```sh
: "${TARGET:?TARGET is not set: do not run this step, ask the human}" "${NAME:?NAME is not set: do not run this step, ask the human}" \
  && test -f "$TARGET/sgconfig.yml" \
  && cd "$TARGET" \
  && rm -f INSTALL.md docs/assets/logo-mark.svg docs/assets/logo-wordmark.svg \
  && if [ -d docs/assets ]; then rmdir docs/assets; fi \
  && echo step5-ok
```

It must print `step5-ok`. Anything else means it refused and changed nothing: an error message names the missing variable, and no output at all means `$TARGET/sgconfig.yml` does not exist, so `$TARGET` is not the copied template.

Keep `LICENSE`, `.github/`, `AGENTS.md`, `docs/features/`, `docs/limits.md` and the example features. Do not edit `.github/workflows/ci.yml` (hard rule 4).

Then replace `$TARGET/README.md` with this text (use `$NAME`):

```md
# <name>

Built on the Mimeograph cage. Run `pnpm check` before every commit; CI runs the same command. Rules for agents are in [AGENTS.md](./AGENTS.md).
```

**Skip replacing `README.md` if** its first line is already `# $NAME`.

Check:

```sh
cd "${TARGET:?TARGET is not set}" && test ! -e INSTALL.md && test ! -d docs/assets && head -1 README.md
```

The last command must print `# ` followed by the project name.

## Step 6. Rename the project

This step refuses to run when `TARGET` or `NAME` is not set, or when `$TARGET` is not the copied template, so that no file is edited in the wrong folder. Run the guard first:

```sh
: "${TARGET:?TARGET is not set: do not run this step, ask the human}" "${NAME:?NAME is not set: do not run this step, ask the human}" \
  && test -f "$TARGET/sgconfig.yml" \
  && test -f "$TARGET/package.json" \
  && echo guard-ok
```

Edit only if it printed `guard-ok`. If it printed an error or nothing, make no edit and tell the human which variable is missing or that `$TARGET` is not the copied template.

Then, using the full paths under `$TARGET`: in `$TARGET/package.json`, change the `"name"` field from `mimeograph` to `$NAME`. In `$TARGET/AGENTS.md`, change the first line from `# AGENTS.md (Mimeograph)` to `# AGENTS.md`. Edit only those two lines.

**Skip if** already done.

Check:

```sh
cd "${TARGET:?TARGET is not set}" && node -p "require('./package.json').name" && head -1 AGENTS.md
```

The first prints `$NAME`; the second prints `# AGENTS.md`.

## Step 7. Install dependencies

```sh
cd "$TARGET"
pnpm install --frozen-lockfile
```

This downloads packages from the npm registry and runs the install script of `@ast-grep/cli`, the only one allowed in `pnpm-workspace.yaml`. Re-running is safe.

Check: the command exits 0 and `test -d node_modules` succeeds.

## Step 8. Run the gate

```sh
cd "$TARGET"
pnpm check
```

Check: exit code 0. This is the definition of done.

If it fails:

- At the Prettier step only: run `pnpm format`, then `pnpm check` again.
- Anything else: do not edit `rules/`, `tests/` or the tool configs to make it pass, and do not delete or weaken a test. Stop and show the human the failing step and its output.

## Step 9. Report to the human

Send a short message, in the human's language, with these lines filled in. Translate the labels (`project name`, `pnpm check`, `git`, `CI`, `license`, `examples`, `needs you`) and the sentences, not the commands, file names, URLs or variable names:

```text
Mimeograph installed in <TARGET>.
- project name: <NAME>
- pnpm check: green (exit 0)
- git: initialized on main, nothing staged, nothing committed, nothing pushed, no remote
- CI: .github/workflows/ci.yml copied unchanged. It runs on ubuntu-latest unless the repository variable CI_RUNS_ON is set (https://github.com/seatrunk/mimeograph/blob/main/README.md#ci-runner)
- license: LICENSE kept as copied (MIT, copyright 2026 seatrunk); decide if your project needs a different one
- examples: src/features/example-a and example-b and docs/features/example-flow.md kept; delete them when you have your first real feature
- needs you: first commit, remote, push, CI variable
```

Add any step you skipped and why. Then stop.

## Safety note for humans

What the agent will do:

- ask you for the project name and directory, and which path you want;
- download this repository with `git fetch` and nothing else from the network except the npm packages in the lockfile;
- create files only inside the directory you chose, run `git init` there, run `pnpm install --frozen-lockfile` and `pnpm check`;
- tell you exactly what it did and what is left for you.

What the agent will not do:

- install anything globally, pipe a download into a shell, or ask for or touch tokens, passwords and `.env` files;
- write into a directory that already has files, or overwrite or delete anything that was there;
- change CI, set repository variables or settings, create a remote repository, commit or push;
- apply Mimeograph to an existing repository (not supported yet, see issue #2);
- weaken a rule or a test to get `pnpm check` green.

If an agent does any of the second list, stop it.
