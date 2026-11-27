import { spawnSync } from "node:child_process";

const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const defaultBases = [
  "origin/HEAD",
  "origin/main",
  "origin/master",
  "main",
  "master",
];

interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`could not run git ${args.join(" ")}`, {
      cause: result.error,
    });
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function git(cwd: string, args: string[]): string {
  const result = run(cwd, args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function resolveCommit(cwd: string, ref: string): string | null {
  const result = run(cwd, ["rev-parse", "--verify", "-q", `${ref}^{commit}`]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function names(output: string): string[] {
  return output.split("\0").filter((name) => name !== "");
}

export function topLevel(cwd: string): string {
  return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
}

export function resolveBase(
  cwd: string,
  env: Record<string, string | undefined>,
): string {
  const head = resolveCommit(cwd, "HEAD");
  if (head === null) {
    return emptyTree;
  }
  const explicit = env.ADOPTION_BASE ?? "";
  const pullRequestBase = env.GITHUB_BASE_REF ?? "";
  const hint =
    "Fetch the full history (actions/checkout needs fetch-depth: 0) or set ADOPTION_BASE to the branch your changes will merge into.";
  let base: string | null = null;
  if (explicit !== "") {
    base = resolveCommit(cwd, explicit);
    if (base === null) {
      throw new Error(`ADOPTION_BASE=${explicit} is not a commit. ${hint}`);
    }
  } else if (pullRequestBase !== "") {
    base = resolveCommit(cwd, `origin/${pullRequestBase}`);
    if (base === null) {
      throw new Error(`origin/${pullRequestBase} is not available. ${hint}`);
    }
  } else {
    for (const candidate of defaultBases) {
      base = resolveCommit(cwd, candidate);
      if (base !== null) {
        break;
      }
    }
    if (base === null) {
      throw new Error(
        `none of ${defaultBases.join(", ")} exists, so the base to compare against is unknown. ${hint}`,
      );
    }
  }
  const mergeBase = run(cwd, ["merge-base", "HEAD", base]);
  if (mergeBase.status !== 0) {
    throw new Error(`HEAD and ${base} share no history in this clone. ${hint}`);
  }
  return mergeBase.stdout.trim();
}

export function changedFiles(cwd: string, base: string): Set<string> {
  const tracked = git(cwd, [
    "diff",
    "--name-only",
    "--no-renames",
    "--diff-filter=d",
    "-z",
    base,
  ]);
  const untracked = git(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  return new Set([...names(tracked), ...names(untracked)]);
}

export function readAt(cwd: string, base: string, path: string): string | null {
  if (base === emptyTree) {
    return null;
  }
  const result = run(cwd, ["show", `${base}:${path}`]);
  return result.status === 0 ? result.stdout : null;
}
