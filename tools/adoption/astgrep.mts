import { spawnSync } from "node:child_process";
import { add, type Counts } from "./baseline.mts";

function isViolation(
  value: unknown,
): value is { file: string; ruleId: string; severity?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "file" in value &&
    typeof value.file === "string" &&
    "ruleId" in value &&
    typeof value.ruleId === "string"
  );
}

function parseStream(output: string): Counts {
  const counts: Counts = new Map();
  for (const line of output.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const entry: unknown = JSON.parse(line);
    if (!isViolation(entry)) {
      throw new Error(`unexpected ast-grep output: ${line.slice(0, 200)}`);
    }
    if (entry.severity === undefined || entry.severity === "error") {
      add(counts, entry.file, entry.ruleId);
    }
  }
  return counts;
}

export function scanCounts(cwd: string): Counts {
  const result = spawnSync("ast-grep", ["scan", "--json=stream"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error("could not run ast-grep", { cause: result.error });
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`ast-grep scan failed: ${result.stderr.trim()}`);
  }
  const counts = parseStream(result.stdout);
  if (result.status === 1 && counts.size === 0) {
    throw new Error(
      `ast-grep reported errors but no violations: ${result.stderr.trim()}`,
    );
  }
  return counts;
}

export function showDiagnostics(cwd: string, files: string[]): void {
  if (files.length > 0) {
    spawnSync("ast-grep", ["scan", ...files.map((file) => `./${file}`)], {
      cwd,
      stdio: "inherit",
    });
  }
}

export function scanPassthrough(cwd: string): number {
  const result = spawnSync("ast-grep", ["scan"], { cwd, stdio: "inherit" });
  if (result.error) {
    throw new Error("could not run ast-grep", { cause: result.error });
  }
  return result.status ?? 1;
}
