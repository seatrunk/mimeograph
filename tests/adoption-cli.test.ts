import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const baselineFile = "adoption/baseline.json";

interface Outcome {
  status: number;
  text: string;
}

const legacy: Record<string, string> = {
  "src/legacy/a.ts": [
    "// legacy comment one",
    "export function parse(text: string): unknown {",
    "  try {",
    "    return JSON.parse(text);",
    "  } catch (e) {}",
    "  return undefined; // legacy comment two",
    "}",
    "",
  ].join("\n"),
  "src/legacy/b.ts": "// legacy comment\nexport const b = 1;\n",
  "src/app/main.ts":
    'import { y } from "../features/y/inner.ts";\n\nexport const z = y;\n',
  "src/clean.ts": "export const clean = 1;\n",
};

const cleanA = [
  "export function parse(text: string): unknown {",
  "  return JSON.parse(text);",
  "}",
  "",
].join("\n");

class Repo {
  readonly dir: string;
  private readonly bin: string;

  constructor(files: Record<string, string>, branch = "main") {
    this.dir = mkdtempSync(join(tmpdir(), "adoption-"));
    this.bin = join(this.dir, "node_modules", ".bin");
    for (const entry of ["rules", "sgconfig.yml", "tools"]) {
      cpSync(join(root, entry), join(this.dir, entry), { recursive: true });
    }
    symlinkSync(join(root, "node_modules"), join(this.dir, "node_modules"));
    writeFileSync(join(this.dir, ".gitignore"), "node_modules\n");
    this.write(files);
    this.git("init", "-q", "-b", branch);
    this.git("config", "user.email", "test@example.com");
    this.git("config", "user.name", "test");
    this.git("config", "commit.gpgsign", "false");
    this.commit("base");
  }

  write(files: Record<string, string>): void {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(this.dir, path)), { recursive: true });
      writeFileSync(join(this.dir, path), content);
    }
  }

  read(path: string): string {
    return readFileSync(join(this.dir, path), "utf8");
  }

  exists(path: string): boolean {
    return existsSync(join(this.dir, path));
  }

  git(...args: string[]): string {
    const result = spawnSync("git", args, {
      cwd: this.dir,
      encoding: "utf8",
      env: this.env({}),
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    }
    return result.stdout;
  }

  commit(message: string): void {
    this.git("add", "-A");
    this.git("commit", "-q", "-m", message);
  }

  env(extra: Record<string, string>): NodeJS.ProcessEnv {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.startsWith("VITEST") &&
          !key.startsWith("GIT_") &&
          key !== "ADOPTION_BASE" &&
          key !== "GITHUB_BASE_REF",
      ),
    );
    env.PATH = `${this.bin}:${process.env.PATH ?? ""}`;
    env.NO_COLOR = "1";
    return { ...env, ...extra };
  }

  adoption(command: string, extra: Record<string, string> = {}): Outcome {
    const result = spawnSync(
      "node",
      [
        "--disable-warning=ExperimentalWarning",
        "tools/adoption/cli.mts",
        command,
      ],
      { cwd: this.dir, encoding: "utf8", env: this.env(extra) },
    );
    return {
      status: result.status ?? -1,
      text: `${result.stdout}${result.stderr}`,
    };
  }

  baseline(): Record<string, Record<string, number>> {
    const parsed: { violations: Record<string, Record<string, number>> } =
      JSON.parse(this.read(baselineFile));
    return parsed.violations;
  }

  destroy(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

async function withRepo(
  files: Record<string, string>,
  body: (repo: Repo) => void,
  branch = "main",
): Promise<void> {
  const repo = new Repo(files, branch);
  try {
    body(repo);
  } finally {
    repo.destroy();
  }
}

function adopted(repo: Repo): void {
  repo.git("switch", "-q", "-c", "adopt");
  expect(repo.adoption("init").status).toBe(0);
  repo.commit("adopt");
  repo.git("switch", "-q", "main");
  repo.git("merge", "-q", "--ff-only", "adopt");
  repo.git("switch", "-q", "-c", "work");
}

describe.concurrent("adoption cli", { timeout: 120_000 }, () => {
  test("without a baseline it is the plain strict scan", () =>
    withRepo(legacy, (repo) => {
      const result = repo.adoption("scan");
      expect(result.status).toBe(1);
      expect(result.text).toContain("no-comments");
      expect(result.text).not.toContain("adoption:");
    }));

  test("without a baseline a clean repository passes", () =>
    withRepo({ "src/clean.ts": legacy["src/clean.ts"] ?? "" }, (repo) => {
      expect(repo.adoption("scan").status).toBe(0);
    }));

  test("init records comments, a cross-feature import and an empty catch per file and rule", () =>
    withRepo(legacy, (repo) => {
      const result = repo.adoption("init");
      expect(result.status).toBe(0);
      expect(repo.baseline()).toEqual({
        "src/app/main.ts": { "feature-public-api-only": 1 },
        "src/legacy/a.ts": { "no-comments": 2, "no-swallowed-catch": 1 },
        "src/legacy/b.ts": { "no-comments": 1 },
      });
    }));

  test("the written baseline is Prettier-stable", () =>
    withRepo(legacy, (repo) => {
      repo.adoption("init");
      const result = spawnSync("prettier", ["--check", baselineFile], {
        cwd: repo.dir,
        encoding: "utf8",
        env: repo.env({}),
      });
      expect(result.status).toBe(0);
    }));

  test("init refuses to overwrite an existing baseline", () =>
    withRepo(legacy, (repo) => {
      repo.adoption("init");
      const before = repo.read(baselineFile);
      repo.write({
        "src/legacy/b.ts": "// one\n// two\nexport const b = 1;\n",
      });
      const result = repo.adoption("init");
      expect(result.status).toBe(1);
      expect(result.text).toContain("already exists");
      expect(repo.read(baselineFile)).toBe(before);
    }));

  test("the adoption branch itself passes: legacy violations are allowed once baselined", () =>
    withRepo(legacy, (repo) => {
      repo.git("switch", "-q", "-c", "adopt");
      repo.adoption("init");
      const result = repo.adoption("scan");
      expect(result.text).toContain("adoption: ok");
      expect(result.status).toBe(0);
      repo.commit("adopt");
      expect(repo.adoption("scan").status).toBe(0);
    }));

  test("a branch that changes nothing passes", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      const result = repo.adoption("scan");
      expect(result.status).toBe(0);
      expect(result.text).toContain("0 changed file(s)");
    }));

  test("a new file with a comment fails, committed or not", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({ "src/new.ts": "// nope\nexport const n = 1;\n" });
      const dirty = repo.adoption("scan");
      expect(dirty.status).toBe(1);
      expect(dirty.text).toContain("STRICT src/new.ts: no-comments x1");
      repo.commit("add new");
      const committed = repo.adoption("scan");
      expect(committed.status).toBe(1);
      expect(committed.text).toContain("STRICT src/new.ts");
    }));

  test("a new clean file passes", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({ "src/new.ts": "export const n = 1;\n" });
      expect(repo.adoption("scan").status).toBe(0);
      repo.commit("add new");
      expect(repo.adoption("scan").status).toBe(0);
    }));

  test("a new file that violates the boundary and catch rules fails", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({
        "src/new.ts":
          'import { y } from "../features/y/inner.ts";\n\nexport function f(): unknown {\n  try {\n    return y;\n  } catch (e) {}\n  return undefined;\n}\n',
      });
      const result = repo.adoption("scan");
      expect(result.status).toBe(1);
      expect(result.text).toContain(
        "STRICT src/new.ts: feature-public-api-only",
      );
      expect(result.text).toContain("STRICT src/new.ts: no-swallowed-catch");
    }));

  test("touching a baselined file makes it strict even when its violations did not change", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({
        "src/legacy/b.ts":
          "// legacy comment\nexport const b = 1;\nexport const c = 2;\n",
      });
      const dirty = repo.adoption("scan");
      expect(dirty.status).toBe(1);
      expect(dirty.text).toContain("STRICT src/legacy/b.ts: no-comments x1");
      repo.commit("touch b");
      const committed = repo.adoption("scan");
      expect(committed.status).toBe(1);
      expect(committed.text).toContain("STRICT src/legacy/b.ts");
    }));

  test("a baselined file that is not touched keeps passing while others change", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({ "src/clean.ts": "export const clean = 2;\n" });
      repo.commit("edit clean");
      expect(repo.adoption("scan").status).toBe(0);
    }));

  test("cleaning a baselined file is stale until the baseline shrinks, then it passes", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({ "src/legacy/a.ts": cleanA });
      repo.commit("clean a");
      const stale = repo.adoption("scan");
      expect(stale.status).toBe(1);
      expect(stale.text).toContain("STALE  src/legacy/a.ts: no-comments");
      expect(stale.text).toContain("pnpm adoption:update");
      const update = repo.adoption("update");
      expect(update.status).toBe(0);
      expect(repo.baseline()).toEqual({
        "src/app/main.ts": { "feature-public-api-only": 1 },
        "src/legacy/b.ts": { "no-comments": 1 },
      });
      const after = repo.adoption("scan");
      expect(after.status).toBe(0);
      expect(after.text).toContain("adoption: ok");
    }));

  test("partially cleaning a file leaves it strict, not baselined", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({
        "src/legacy/a.ts": cleanA.replace(
          "return JSON.parse(text);",
          "return JSON.parse(text); // still here",
        ),
      });
      repo.adoption("update");
      expect(repo.baseline()["src/legacy/a.ts"]).toEqual({ "no-comments": 1 });
      const result = repo.adoption("scan");
      expect(result.status).toBe(1);
      expect(result.text).toContain("STRICT src/legacy/a.ts: no-comments x1");
    }));

  test("update never adds an entry or raises a count", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      const before = repo.read(baselineFile);
      repo.write({
        "src/new.ts": "// nope\nexport const n = 1;\n",
        "src/legacy/b.ts": "// one\n// two\n// three\nexport const b = 1;\n",
      });
      const result = repo.adoption("update");
      expect(result.status).toBe(0);
      expect(repo.read(baselineFile)).toBe(before);
      expect(repo.adoption("scan").status).toBe(1);
    }));

  test("update without a baseline refuses", () =>
    withRepo(legacy, (repo) => {
      const result = repo.adoption("update");
      expect(result.status).toBe(1);
      expect(repo.exists(baselineFile)).toBe(false);
    }));

  test("raising a baseline count to hide a new violation fails against the base", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({
        "src/legacy/b.ts": "// one\n// two\nexport const b = 1;\n",
        [baselineFile]: repo
          .read(baselineFile)
          .replace('"no-comments": 1', '"no-comments": 2'),
      });
      repo.commit("hide");
      const result = repo.adoption("scan");
      expect(result.status).toBe(1);
      expect(result.text).toContain(
        "GROWTH src/legacy/b.ts: no-comments x2 in adoption/baseline.json, 1 at the base",
      );
    }));

  test("adding a file to the baseline to hide a new file fails against the base", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({
        "src/new.ts": "// nope\nexport const n = 1;\n",
        [baselineFile]: repo
          .read(baselineFile)
          .replace(
            '"src/legacy/b.ts"',
            '"src/new.ts": {\n      "no-comments": 1\n    },\n    "src/legacy/b.ts"',
          ),
      });
      repo.commit("hide new");
      const result = repo.adoption("scan");
      expect(result.status).toBe(1);
      expect(result.text).toContain("GROWTH src/new.ts: no-comments x1");
      expect(result.text).toContain("STRICT src/new.ts: no-comments x1");
    }));

  test("deleting the baseline makes the repository strict again", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      rmSync(join(repo.dir, baselineFile));
      const result = repo.adoption("scan");
      expect(result.status).toBe(1);
      expect(result.text).toContain("no-comments");
    }));

  test("a renamed file counts as changed and the old path goes stale", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.git("mv", "src/legacy/b.ts", "src/legacy/c.ts");
      const result = repo.adoption("scan");
      expect(result.status).toBe(1);
      expect(result.text).toContain("STRICT src/legacy/c.ts: no-comments x1");
      expect(result.text).toContain("STALE  src/legacy/b.ts: no-comments");
    }));

  test("a deleted baselined file leaves a stale entry that update removes", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      rmSync(join(repo.dir, "src/legacy/b.ts"));
      expect(repo.adoption("scan").text).toContain("STALE  src/legacy/b.ts");
      repo.adoption("update");
      expect(repo.baseline()["src/legacy/b.ts"]).toBeUndefined();
      expect(repo.adoption("scan").status).toBe(0);
    }));

  test("a corrupt baseline is an error, not a pass", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.write({ [baselineFile]: "{" });
      const result = repo.adoption("scan");
      expect(result.status).toBe(2);
      expect(result.text).toContain("not valid JSON");
    }));

  test("an unknown base is an error that names ADOPTION_BASE", () =>
    withRepo(
      legacy,
      (repo) => {
        repo.git("switch", "-q", "-c", "adopt");
        repo.adoption("init");
        repo.commit("adopt");
        const result = repo.adoption("scan");
        expect(result.status).toBe(2);
        expect(result.text).toContain("ADOPTION_BASE");
        expect(repo.adoption("scan", { ADOPTION_BASE: "nope" }).status).toBe(2);
      },
      "trunk",
    ));

  test("ADOPTION_BASE picks the branch to compare against", () =>
    withRepo(
      legacy,
      (repo) => {
        repo.adoption("init");
        repo.commit("adopt");
        repo.git("switch", "-q", "-c", "work");
        repo.write({
          "src/legacy/b.ts": "// legacy comment\nexport const b = 3;\n",
        });
        repo.commit("touch b");
        const result = repo.adoption("scan", { ADOPTION_BASE: "trunk" });
        expect(result.status).toBe(1);
        expect(result.text).toContain("STRICT src/legacy/b.ts");
      },
      "trunk",
    ));

  test("CI pull request mode compares with origin/<GITHUB_BASE_REF>", () =>
    withRepo(legacy, (repo) => {
      adopted(repo);
      repo.git("remote", "add", "origin", repo.dir);
      repo.git("fetch", "-q", "origin");
      repo.write({
        "src/legacy/b.ts": "// legacy comment\nexport const b = 3;\n",
      });
      repo.commit("touch b");
      const result = repo.adoption("scan", { GITHUB_BASE_REF: "main" });
      expect(result.status).toBe(1);
      expect(result.text).toContain("STRICT src/legacy/b.ts");
      const missing = repo.adoption("scan", { GITHUB_BASE_REF: "release" });
      expect(missing.status).toBe(2);
      expect(missing.text).toContain("fetch-depth: 0");
    }));

  test("runs only from the repository root", () =>
    withRepo(legacy, (repo) => {
      mkdirSync(join(repo.dir, "sub"));
      const result = spawnSync(
        "node",
        [
          "--disable-warning=ExperimentalWarning",
          join(repo.dir, "tools/adoption/cli.mts"),
          "update",
        ],
        { cwd: join(repo.dir, "sub"), encoding: "utf8", env: repo.env({}) },
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("root of the git repository");
    }));

  test("strict mode needs no git repository", () =>
    withRepo(legacy, (repo) => {
      rmSync(join(repo.dir, ".git"), { recursive: true, force: true });
      expect(repo.adoption("scan").status).toBe(1);
      repo.write({
        "src/legacy/a.ts": cleanA,
        "src/legacy/b.ts": "export const b = 1;\n",
        "src/app/main.ts": "export const z = 1;\n",
      });
      expect(repo.adoption("scan").status).toBe(0);
    }));

  const brokenScanners: [string, string, string][] = [
    [
      "output that is not a violation",
      "echo '{\"hello\":1}'\nexit 1",
      "unexpected ast-grep output",
    ],
    ["a crash", "echo boom >&2\nexit 2", "ast-grep scan failed: boom"],
    [
      "an error exit with no violations",
      "exit 1",
      "reported errors but no violations",
    ],
  ];

  test.each(brokenScanners)(
    "a scanner that gives %s is an error, never a pass",
    (_name, script, message) =>
      withRepo(legacy, (repo) => {
        adopted(repo);
        const fake = join(repo.dir, ".fake");
        mkdirSync(fake);
        writeFileSync(join(fake, "ast-grep"), `#!/bin/sh\n${script}\n`, {
          mode: 0o755,
        });
        const path = `${fake}:${repo.env({}).PATH ?? ""}`;
        const result = repo.adoption("scan", { PATH: path });
        expect(result.status).toBe(2);
        expect(result.text).toContain(message);
        expect(repo.adoption("update", { PATH: path }).status).toBe(2);
      }),
  );

  test("an unknown command prints the usage", () =>
    withRepo(legacy, (repo) => {
      const result = repo.adoption("nope");
      expect(result.status).toBe(2);
      expect(result.text).toContain("usage:");
    }));
});
