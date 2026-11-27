import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { scanCounts, scanPassthrough, showDiagnostics } from "./astgrep.mts";
import {
  baselinePath,
  growth,
  parseBaseline,
  serializeBaseline,
  shrink,
  total,
  type Counts,
} from "./baseline.mts";
import { evaluate, type Problem } from "./evaluate.mts";
import {
  changedFiles,
  readAt,
  resolveBase,
  topLevel,
  tryTopLevel,
} from "./git.mts";

const usage = "usage: cli.mts scan | init | update";

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function requireRoot(): string {
  const cwd = realpathSync(process.cwd());
  if (realpathSync(topLevel(cwd)) !== cwd) {
    throw new Error("run this from the root of the git repository");
  }
  return cwd;
}

function describe(problem: Problem): string {
  const where = `${problem.file}: ${problem.rule}`;
  if (problem.kind === "strict") {
    return `STRICT ${where} x${problem.count}: the file is new or changed, so no baseline allowance applies. Fix it.`;
  }
  if (problem.kind === "new") {
    return `NEW    ${where} x${problem.count}, baseline allows ${problem.allowed}. Fix it; the baseline never grows.`;
  }
  return `STALE  ${where} x${problem.count}, baseline still lists ${problem.allowed}. Run "pnpm adoption:update" and commit ${baselinePath}.`;
}

function loadBaseline(root: string): Counts {
  return parseBaseline(readFileSync(join(root, baselinePath), "utf8"));
}

function scan(env: Record<string, string | undefined>): number {
  const cwd = realpathSync(process.cwd());
  if (!existsSync(join(cwd, baselinePath))) {
    const top = tryTopLevel(cwd);
    if (
      top !== null &&
      realpathSync(top) !== cwd &&
      existsSync(join(top, baselinePath))
    ) {
      throw new Error("run this from the root of the git repository");
    }
    return scanPassthrough(cwd);
  }
  const root = requireRoot();
  const baseline = loadBaseline(root);
  const base = resolveBase(root, env);
  const atBase = readAt(root, base, baselinePath);
  const grown = atBase === null ? [] : growth(baseline, parseBaseline(atBase));
  const changed = changedFiles(root, base);
  const problems = evaluate(scanCounts(root), baseline, changed);
  out(
    `adoption: base ${base.slice(0, 12)}, ${changed.size} changed file(s), baseline ${total(baseline)} violation(s) in ${baseline.size} file(s)`,
  );
  for (const item of grown) {
    out(
      `GROWTH ${item.file}: ${item.rule} x${item.head} in ${baselinePath}, ${item.base} at the base. The baseline can only shrink.`,
    );
  }
  for (const problem of problems) {
    out(describe(problem));
  }
  showDiagnostics(
    root,
    problems
      .filter((problem) => problem.kind !== "stale")
      .map((problem) => problem.file)
      .filter((file, index, all) => all.indexOf(file) === index)
      .slice(0, 50),
  );
  if (grown.length === 0 && problems.length === 0) {
    out("adoption: ok");
    return 0;
  }
  return 1;
}

function write(root: string, counts: Counts): void {
  const target = join(root, baselinePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, serializeBaseline(counts));
}

function init(root: string): number {
  if (existsSync(join(root, baselinePath))) {
    out(
      `${baselinePath} already exists. It can only shrink: use "pnpm adoption:update".`,
    );
    return 1;
  }
  const counts = scanCounts(root);
  write(root, counts);
  out(
    `wrote ${baselinePath}: ${total(counts)} violation(s) in ${counts.size} file(s)`,
  );
  return 0;
}

function update(root: string): number {
  if (!existsSync(join(root, baselinePath))) {
    out(`${baselinePath} does not exist. Run "pnpm adoption:init" first.`);
    return 1;
  }
  const previous = loadBaseline(root);
  const next = shrink(previous, scanCounts(root));
  write(root, next);
  out(
    `${baselinePath}: ${total(previous)} -> ${total(next)} violation(s), ${previous.size} -> ${next.size} file(s)`,
  );
  return 0;
}

function main(args: string[], env: Record<string, string | undefined>): number {
  const command = args[0];
  if (command === "scan") {
    return scan(env);
  }
  if (command === "init") {
    return init(requireRoot());
  }
  if (command === "update") {
    return update(requireRoot());
  }
  out(usage);
  return 2;
}

try {
  process.exitCode = main(process.argv.slice(2), process.env);
} catch (error) {
  process.stderr.write(
    `adoption: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
