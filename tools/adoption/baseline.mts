export const baselinePath = "adoption/baseline.json";

export type Counts = Map<string, Map<string, number>>;

export interface Growth {
  file: string;
  rule: string;
  head: number;
  base: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

function compareKeys(a: [string, unknown], b: [string, unknown]): number {
  return compareText(a[0], b[0]);
}

export function countOf(counts: Counts, file: string, rule: string): number {
  return counts.get(file)?.get(rule) ?? 0;
}

export function add(counts: Counts, file: string, rule: string): void {
  const rules = counts.get(file) ?? new Map<string, number>();
  rules.set(rule, (rules.get(rule) ?? 0) + 1);
  counts.set(file, rules);
}

export function total(counts: Counts): number {
  let sum = 0;
  for (const rules of counts.values()) {
    for (const count of rules.values()) {
      sum += count;
    }
  }
  return sum;
}

export function parseBaseline(text: string): Counts {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${baselinePath} is not valid JSON`, { cause: error });
  }
  if (!isRecord(data) || Object.keys(data).length !== 2) {
    throw new Error(
      `${baselinePath} must be an object with exactly "version" and "violations"`,
    );
  }
  if (data.version !== 1) {
    throw new Error(`${baselinePath}: unsupported version, expected 1`);
  }
  const violations = data.violations;
  if (!isRecord(violations)) {
    throw new Error(`${baselinePath}: "violations" must be an object`);
  }
  const counts: Counts = new Map();
  for (const [file, rules] of Object.entries(violations)) {
    if (!isRecord(rules) || Object.keys(rules).length === 0) {
      throw new Error(
        `${baselinePath}: "${file}" must map at least one rule id to a count`,
      );
    }
    const parsed = new Map<string, number>();
    for (const [rule, count] of Object.entries(rules)) {
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
        throw new Error(
          `${baselinePath}: "${file}" / "${rule}" must be a positive integer`,
        );
      }
      parsed.set(rule, count);
    }
    counts.set(file, parsed);
  }
  return counts;
}

export function serializeBaseline(counts: Counts): string {
  const violations = Object.fromEntries(
    [...counts]
      .sort(compareKeys)
      .map(([file, rules]) => [
        file,
        Object.fromEntries([...rules].sort(compareKeys)),
      ]),
  );
  return `${JSON.stringify({ version: 1, violations }, null, 2)}\n`;
}

export function shrink(previous: Counts, current: Counts): Counts {
  const next: Counts = new Map();
  for (const [file, rules] of previous) {
    for (const [rule, allowed] of rules) {
      const kept = Math.min(allowed, countOf(current, file, rule));
      if (kept > 0) {
        const nextRules = next.get(file) ?? new Map<string, number>();
        nextRules.set(rule, kept);
        next.set(file, nextRules);
      }
    }
  }
  return next;
}

export function growth(head: Counts, base: Counts): Growth[] {
  const found: Growth[] = [];
  for (const [file, rules] of head) {
    for (const [rule, count] of rules) {
      const before = countOf(base, file, rule);
      if (count > before) {
        found.push({ file, rule, head: count, base: before });
      }
    }
  }
  return found.sort(
    (a, b) => compareText(a.file, b.file) || compareText(a.rule, b.rule),
  );
}
