import { countOf, type Counts } from "./baseline.mts";

export type Problem =
  | { kind: "strict"; file: string; rule: string; count: number }
  | { kind: "new"; file: string; rule: string; count: number; allowed: number }
  | {
      kind: "stale";
      file: string;
      rule: string;
      count: number;
      allowed: number;
    };

export function evaluate(
  current: Counts,
  baseline: Counts,
  changed: ReadonlySet<string>,
): Problem[] {
  const problems: Problem[] = [];
  const files = new Set([...current.keys(), ...baseline.keys()]);
  for (const file of [...files].sort()) {
    const rules = new Set([
      ...(current.get(file)?.keys() ?? []),
      ...(baseline.get(file)?.keys() ?? []),
    ]);
    for (const rule of [...rules].sort()) {
      const count = countOf(current, file, rule);
      const allowed = countOf(baseline, file, rule);
      if (changed.has(file) && count > 0) {
        problems.push({ kind: "strict", file, rule, count });
      } else if (count > allowed) {
        problems.push({ kind: "new", file, rule, count, allowed });
      } else if (count < allowed) {
        problems.push({ kind: "stale", file, rule, count, allowed });
      }
    }
  }
  return problems;
}
