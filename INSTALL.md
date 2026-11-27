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

Talk to the human in the human's language, including the final report in step 9 or B7: translate its labels too. Commands, file names, URLs and variable names stay as written.

## Step 1. Choose the path

Ask the human which one they want:

- **A. New project**: create a new directory from the template. Continue with step 2.
- **B. Existing repository**: add the cage to a repository that already has files or history.

If the answer is **B**: do step 2, then follow **Path B** (steps B1 to B7, after step 9). Do not use steps 3 to 9: they copy the whole template and delete files, which is only right for a new project.

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

## Path B. Existing repository

Adoption mode: the ast-grep rules of the cage apply in full to new and changed files, the violations that already exist are recorded in a committed `adoption/baseline.json`, and that baseline can only shrink. Design: `docs/adoption.md` in the template. It does not install the template's Prettier, Oxlint, tsconfig, knip or Vitest setup; the repository keeps its own tooling.

These rules are added to the hard rules above, for path B only:

- Never edit, reformat or "fix" a source file that already exists, and never delete one. The baseline is there so that you do not have to.
- Never edit `adoption/baseline.json` by hand. Only `pnpm adoption:init` creates it.
- Never commit, push, create a remote, or touch CI. Never set `ADOPTION_BASE` or any other variable to make a failing check pass.
- Everything you create is untracked or an unstaged edit on a new branch, so the human can read it as one diff.

### Step B1. Check the repository

Ask the human for the repository directory and set `TARGET` to it. Then:

```sh
: "${TARGET:?TARGET is not set: ask the human}"
test "$(git -C "$TARGET" rev-parse --show-toplevel 2>/dev/null)" = "$(cd "$TARGET" && pwd -P)" || echo not-a-repo-root
git -C "$TARGET" rev-parse --verify -q HEAD >/dev/null || echo no-commits
test -z "$(git -C "$TARGET" status --porcelain)" || echo dirty-tree
test -f "$TARGET/package.json" || echo no-package-json
for f in package-lock.json yarn.lock bun.lock bun.lockb; do test ! -e "$TARGET/$f" || echo "other-package-manager:$f"; done
for p in sgconfig.yml rules tools/adoption adoption pnpm-workspace.yaml; do test ! -e "$TARGET/$p" || echo "exists:$p"; done
echo b1-done
```

It must end with `b1-done`. Any other line:

- `not-a-repo-root`, `no-package-json`, `other-package-manager:...`: stop, change nothing, tell the human that this repository is not supported yet (path B needs a Node project with `package.json`, pnpm, and the directory being the git root).
- `no-commits`: this is a new project, not an existing one. Tell the human and go back to step 1 with path A.
- `dirty-tree`: stop and ask the human to commit or stash their work. Do not do it for them.
- `exists:pnpm-workspace.yaml`: allowed, step B4 handles it.
- `exists:` of `sgconfig.yml`, `rules`, `tools/adoption` or `adoption`: if `sgconfig.yml`, `rules/core/no-comments.yml`, `tools/adoption/cli.mts` all exist, this is a previous run of this guide: skip B3 and continue at B4 (each later step has a **Skip if**). Otherwise those names belong to the repository: stop and ask the human.

### Step B2. Create a branch

**Skip if** `git -C "$TARGET" branch --show-current` already prints `chore/mimeograph-adoption`.

```sh
git -C "$TARGET" switch -c chore/mimeograph-adoption
```

If the branch name is taken, stop and ask the human for another one.

Check: `git -C "$TARGET" branch --show-current` prints the new branch name.

### Step B3. Copy the cage, and only the cage

**Skip if** step B1 found a previous run.

```sh
git -C "$TARGET" fetch --depth 1 https://github.com/seatrunk/mimeograph.git HEAD
git -C "$TARGET" archive FETCH_HEAD sgconfig.yml rules tools/adoption | tar -x -C "$TARGET"
```

Use the branch or tag the human names in place of `HEAD`; otherwise take the default branch. `git archive` with paths unpacks only those paths, so nothing else from the template is copied and nothing of the repository is overwritten (step B1 confirmed these paths did not exist). If `git fetch` fails because the repository is private or you have no access, stop and tell the human; do not ask for tokens (hard rule 3).

Check:

```sh
test -f "$TARGET/sgconfig.yml" && test -f "$TARGET/rules/core/no-comments.yml" && test -f "$TARGET/tools/adoption/cli.mts" && test -z "$(git -C "$TARGET" diff --cached --name-only)" && echo ok
test -z "$(git -C "$TARGET" status --porcelain | grep -v -e '^?? sgconfig.yml$' -e '^?? rules/$' -e '^?? tools/$' -e '^?? tools/adoption/$')" && echo only-new-paths
```

The first prints `ok`. The second prints `only-new-paths` and exits 0: the only changes are the new paths. If it prints nothing, something else changed: stop and tell the human.

### Step B4. Add the dependency and the scripts

This edits files that existed before you started, so ask the human first. Show them exactly this list and wait for a yes:

1. Create `pnpm-workspace.yaml` containing the two lines below. pnpm refuses to finish installing `@ast-grep/cli` without them (error `ERR_PNPM_IGNORED_BUILDS`). If `pnpm-workspace.yaml` already exists, do not edit it: show it to the human and ask how to allow the build script of `@ast-grep/cli`.
2. Add `@ast-grep/cli` to `devDependencies` with `pnpm add -D`, which also updates `pnpm-lock.yaml`.
3. Add these scripts to `package.json`, and nothing else in it. If any of the names `ast`, `ast:test`, `adoption:init`, `adoption:update` already exists, stop and ask.
4. `check`: if there is no `check` script, add `"check": "pnpm ast && pnpm ast:test"`. If there is one, append ` && pnpm ast && pnpm ast:test` to its value.

```yaml
allowBuilds:
  "@ast-grep/cli": true
```

```json
"ast": "node --disable-warning=ExperimentalWarning tools/adoption/cli.mts scan",
"ast:test": "ast-grep test",
"adoption:init": "node --disable-warning=ExperimentalWarning tools/adoption/cli.mts init",
"adoption:update": "node --disable-warning=ExperimentalWarning tools/adoption/cli.mts update"
```

After the yes, create `pnpm-workspace.yaml` first, then read the version range the template pins and install it:

```sh
RANGE="$(git -C "$TARGET" show FETCH_HEAD:package.json | node -p "JSON.parse(require('node:fs').readFileSync(0, 'utf8')).devDependencies['@ast-grep/cli']")"
echo "$RANGE"
cd "$TARGET" && pnpm add -D "@ast-grep/cli@$RANGE"
```

`FETCH_HEAD` is the one from step B3. If this is a re-run and `FETCH_HEAD` is gone, fetch it again as in step B3 and do not copy. Then edit `package.json` by hand to add the scripts, keeping its existing formatting and key order, and touching no other line.

**Skip if** `@ast-grep/cli` is already in `devDependencies`, the four scripts exist with these values, and `check` contains `pnpm ast && pnpm ast:test`. Skip only the parts that are already done.

Check:

```sh
cd "${TARGET:?TARGET is not set}" && test -x node_modules/.bin/ast-grep && node -p "const s = require('./package.json').scripts; ['ast', 'ast:test', 'adoption:init', 'adoption:update', 'check'].map((k) => k + ' = ' + s[k]).join('\n')"
git -C "$TARGET" status --porcelain
```

The first prints the five scripts. The second lists only: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (new or edited), `sgconfig.yml`, `rules/`, `tools/adoption/`. Anything else, stop and tell the human.

### Step B5. Record the baseline

**Skip if** `$TARGET/adoption/baseline.json` exists.

```sh
cd "$TARGET" && pnpm adoption:init
```

It prints `wrote adoption/baseline.json: N violation(s) in K file(s)`. Do not edit or "improve" the result, and do not fix any of the listed violations.

Check:

```sh
cd "${TARGET:?TARGET is not set}" && pnpm ast && pnpm ast:test
```

`pnpm ast` must print `adoption: ok` and exit 0, and `pnpm ast:test` must exit 0. If `pnpm ast` fails with a message that names `ADOPTION_BASE`, the default branch of this repository is not `main`, `master` or `origin/HEAD`: ask the human which branch the changes will merge into, run `ADOPTION_BASE=<that branch> pnpm ast` for this run only, remember the branch the human gave you for steps B6 and B7, and put the variable in your report (CI will need it too). For any other failure, stop and show the human the command and its output.

### Step B6. Prove that the cage is on

A new file with a comment must fail, and the repository's old violations must not. If step B5 needed `ADOPTION_BASE=<branch>`, put the same `ADOPTION_BASE=<branch>` in front of every `pnpm ast` below; without it the commands fail with exit 2 because the base is unknown. Use only the branch the human gave you in step B5.

```sh
cd "${TARGET:?TARGET is not set}" && printf '// probe\nexport const probe = 1;\n' > mimeograph-probe.ts && pnpm ast; echo "exit=$?"
```

It must print a line starting `STRICT mimeograph-probe.ts: no-comments x1` and `exit=1`. Then remove the probe, which you created a moment ago, and confirm the gate is green again:

```sh
cd "${TARGET:?TARGET is not set}" && rm -f mimeograph-probe.ts && test ! -e mimeograph-probe.ts && pnpm ast
```

It must print `adoption: ok`. If the probe did not fail, stop and show the human the output; do not continue.

### Step B7. Run the repository's own checks and report

If the repository had a `check` script before step B4, it still runs the repository's own checks first. Run it and report the result, without fixing anything:

```sh
cd "${TARGET:?TARGET is not set}" && pnpm check
```

If step B5 needed `ADOPTION_BASE=<branch>`, run it as `ADOPTION_BASE=<branch> pnpm check`, with the branch the human gave you in step B5.

If it fails, say whether the failing step is one of the repository's own (it was probably failing before) or complains about the files you copied (`rules/`, `tools/adoption/`, `sgconfig.yml`): in the second case the repository's formatter or type checker is picking them up, and the human decides how to exclude them. Do not edit the repository's tool configuration.

Then get the numbers for the report:

```sh
cd "${TARGET:?TARGET is not set}" && node -p "const v = require('./adoption/baseline.json').violations; const t = {}; for (const f of Object.values(v)) for (const [r, n] of Object.entries(f)) t[r] = (t[r] || 0) + n; Object.entries(t).map(([r, n]) => r + ': ' + n).join('\n')"
```

Send a short message, in the human's language, with these lines filled in. Translate the labels and the sentences, not the commands, file names, URLs or variable names:

```text
Mimeograph adopted in <TARGET> on branch chore/mimeograph-adoption.
- baseline: <N> existing violations in <K> files recorded in adoption/baseline.json (<per-rule counts>). They are allowed only in files you do not touch, and the baseline can only shrink
- strict: any new or changed file must pass every rule; pnpm ast fails it otherwise
- pnpm ast: ok (exit 0); the probe with a comment in a new file failed as STRICT and was removed
- your own checks: <pnpm check result, or "no check script before">
- git: nothing staged, nothing committed, nothing pushed, no remote
- changed: new sgconfig.yml, rules/, tools/adoption/, adoption/baseline.json, pnpm-workspace.yaml (if created); edited package.json, pnpm-lock.yaml
- CI: not touched. It needs Node 24 or newer, actions/checkout with fetch-depth: 0, and pnpm check (or pnpm ast && pnpm ast:test)
- needs you: review the diff, commit on the branch, open the PR, change CI, protect rules/, sgconfig.yml, tools/adoption/ and adoption/ with CODEOWNERS and branch protection
```

Add any step you skipped and why. Then stop. To clean a legacy file later: fix it, run `pnpm adoption:update`, commit both.

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
- on an existing repository (path B), edit, reformat or delete any source file, commit, push, or touch CI; it only adds the paths listed in step B3, edits `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml` after you approve the exact list in step B4, and works on a new branch;
- weaken a rule or a test to get `pnpm check` green.

If an agent does any of the second list, stop it.
