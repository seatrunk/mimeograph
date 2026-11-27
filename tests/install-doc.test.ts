import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

function section(title: string): string {
  const text = readFileSync(join(root, "INSTALL.md"), "utf8");
  const start = text.indexOf(`### ${title}`);
  if (start === -1) {
    throw new Error(`INSTALL.md has no section ${title}`);
  }
  const rest = text.slice(start + 4);
  const end = rest.search(/\n##+ /);
  return end === -1 ? rest : rest.slice(0, end);
}

function shBlocks(body: string): string[] {
  return [...body.matchAll(/```sh\n([\s\S]*?)```/g)].map(
    (match) => match[1] ?? "",
  );
}

function blockAfter(body: string, marker: string): string {
  const at = body.indexOf(marker);
  if (at === -1) {
    throw new Error(`no ${marker} in section`);
  }
  const block = shBlocks(body.slice(at))[0];
  if (block === undefined) {
    throw new Error(`no sh block after ${marker}`);
  }
  return block;
}

function repoWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "install-doc-"));
  const git = (...args: string[]): void => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    }
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return dir;
}

function runBlock(
  block: string,
  target: string,
): { status: number; out: string } {
  const result = spawnSync("sh", ["-c", block], {
    cwd: tmpdir(),
    encoding: "utf8",
    env: { ...process.env, TARGET: target },
  });
  return { status: result.status ?? -1, out: result.stdout };
}

describe("INSTALL.md path B", () => {
  test("B1 prints only b1-done on a clean repository", () => {
    const dir = repoWith({ "package.json": "{}\n" });
    try {
      const result = runBlock(
        blockAfter(section("Step B1."), "Ask the human"),
        dir,
      );
      expect(result.out).toBe("b1-done\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("B1 flags a dirty tree", () => {
    const dir = repoWith({ "package.json": "{}\n" });
    try {
      writeFileSync(join(dir, "stray.txt"), "x\n");
      const result = runBlock(
        blockAfter(section("Step B1."), "Ask the human"),
        dir,
      );
      expect(result.out).toBe("dirty-tree\nb1-done\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const copyCage = (dir: string): void => {
    for (const entry of ["sgconfig.yml", "rules"]) {
      cpSync(join(root, entry), join(dir, entry), { recursive: true });
    }
    cpSync(join(root, "tools/adoption"), join(dir, "tools/adoption"), {
      recursive: true,
    });
  };

  test("the B3 check exits 0 when only the cage paths are new", () => {
    const dir = repoWith({
      "package.json": "{}\n",
      "tools/seed.ts": "export {};\n",
    });
    try {
      copyCage(dir);
      const result = runBlock(blockAfter(section("Step B3."), "Check:"), dir);
      expect(result.status).toBe(0);
      expect(result.out).toBe("ok\nonly-new-paths\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the B3 check fails when something else changed", () => {
    const dir = repoWith({ "package.json": "{}\n" });
    try {
      copyCage(dir);
      writeFileSync(join(dir, "stray.txt"), "x\n");
      const result = runBlock(blockAfter(section("Step B3."), "Check:"), dir);
      expect(result.status).not.toBe(0);
      expect(result.out).toBe("ok\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the B4 skip rule names @ast-grep/cli and the check script", () => {
    const body = section("Step B4.");
    const skip = body
      .split("\n")
      .find((line) => line.startsWith("**Skip if**"));
    expect(skip).toContain("`@ast-grep/cli`");
    expect(skip).toContain("pnpm ast && pnpm ast:test");
    expect(skip).not.toContain("`ast-grep`");
  });

  test("B5, B6 and B7 carry the base branch forward", () => {
    expect(section("Step B5.")).toContain("remember the branch");
    expect(section("Step B6.")).toContain("ADOPTION_BASE=<branch>");
    expect(section("Step B7.")).toContain("ADOPTION_BASE=<branch> pnpm check");
  });
});
