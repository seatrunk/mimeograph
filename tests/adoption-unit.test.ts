import { describe, expect, test } from "vitest";
import {
  growth,
  parseBaseline,
  serializeBaseline,
  shrink,
  type Counts,
} from "../tools/adoption/baseline.mts";
import { evaluate } from "../tools/adoption/evaluate.mts";

function counts(spec: Record<string, Record<string, number>>): Counts {
  return new Map(
    Object.entries(spec).map(([file, rules]) => [
      file,
      new Map(Object.entries(rules)),
    ]),
  );
}

function flat(value: Counts): Record<string, Record<string, number>> {
  return Object.fromEntries(
    [...value].map(([file, rules]) => [file, Object.fromEntries(rules)]),
  );
}

describe("baseline format", () => {
  test("serializes sorted and stable, and parses back to the same counts", () => {
    const original = counts({
      "src/b.ts": { "no-comments": 2 },
      "src/a.ts": { "no-swallowed-catch": 1, "no-comments": 3 },
    });
    const text = serializeBaseline(original);
    expect(text).toBe(
      `${JSON.stringify(
        {
          version: 1,
          violations: {
            "src/a.ts": { "no-comments": 3, "no-swallowed-catch": 1 },
            "src/b.ts": { "no-comments": 2 },
          },
        },
        null,
        2,
      )}\n`,
    );
    expect(flat(parseBaseline(text))).toEqual(flat(original));
    expect(serializeBaseline(parseBaseline(text))).toBe(text);
  });

  test("an empty baseline is valid", () => {
    const text = serializeBaseline(new Map());
    expect(text).toBe('{\n  "version": 1,\n  "violations": {}\n}\n');
    expect(parseBaseline(text).size).toBe(0);
  });

  test("keeps a file literally named __proto__ as data", () => {
    const text = serializeBaseline(
      new Map([["__proto__", new Map([["no-comments", 1]])]]),
    );
    expect(parseBaseline(text).get("__proto__")?.get("no-comments")).toBe(1);
  });

  const invalid: [string, string][] = [
    ["not JSON", "{"],
    ["an array", "[]"],
    ["a missing version", '{"violations":{}}'],
    ["another version", '{"version":2,"violations":{}}'],
    ["an extra key", '{"version":1,"violations":{},"base":"main"}'],
    ["violations not an object", '{"version":1,"violations":[]}'],
    ["a file with no rules", '{"version":1,"violations":{"a.ts":{}}}'],
    ["a zero count", '{"version":1,"violations":{"a.ts":{"r":0}}}'],
    ["a negative count", '{"version":1,"violations":{"a.ts":{"r":-1}}}'],
    ["a fractional count", '{"version":1,"violations":{"a.ts":{"r":1.5}}}'],
    ["a string count", '{"version":1,"violations":{"a.ts":{"r":"1"}}}'],
  ];

  test.each(invalid)("rejects %s", (_name, text) => {
    expect(() => parseBaseline(text)).toThrow("adoption/baseline.json");
  });
});

describe("shrink", () => {
  test("lowers counts and drops entries that reached zero", () => {
    const previous = counts({
      "a.ts": { "no-comments": 3, "no-swallowed-catch": 1 },
      "b.ts": { "no-comments": 2 },
    });
    const current = counts({
      "a.ts": { "no-comments": 1 },
    });
    expect(flat(shrink(previous, current))).toEqual({
      "a.ts": { "no-comments": 1 },
    });
  });

  test("never raises a count and never adds a file or a rule", () => {
    const previous = counts({ "a.ts": { "no-comments": 1 } });
    const current = counts({
      "a.ts": { "no-comments": 9, "no-swallowed-catch": 4 },
      "new.ts": { "no-comments": 1 },
    });
    expect(flat(shrink(previous, current))).toEqual({
      "a.ts": { "no-comments": 1 },
    });
  });

  test("is idempotent", () => {
    const previous = counts({ "a.ts": { "no-comments": 3 } });
    const current = counts({ "a.ts": { "no-comments": 2 } });
    const once = shrink(previous, current);
    expect(flat(shrink(once, current))).toEqual(flat(once));
  });
});

describe("growth against the base baseline", () => {
  const base = counts({ "a.ts": { "no-comments": 2 } });

  test("reports a raised count, a new rule and a new file", () => {
    const head = counts({
      "a.ts": { "no-comments": 3, "no-swallowed-catch": 1 },
      "z.ts": { "no-comments": 1 },
    });
    expect(growth(head, base)).toEqual([
      { file: "a.ts", rule: "no-comments", head: 3, base: 2 },
      { file: "a.ts", rule: "no-swallowed-catch", head: 1, base: 0 },
      { file: "z.ts", rule: "no-comments", head: 1, base: 0 },
    ]);
  });

  test("accepts equal, lower and removed entries", () => {
    expect(growth(base, base)).toEqual([]);
    expect(growth(counts({ "a.ts": { "no-comments": 1 } }), base)).toEqual([]);
    expect(growth(new Map(), base)).toEqual([]);
  });
});

describe("evaluate", () => {
  const baseline = counts({
    "old.ts": { "no-comments": 2 },
    "other.ts": { "no-swallowed-catch": 1 },
  });
  const noChanges = new Set<string>();

  test("passes when an untouched file matches the baseline exactly", () => {
    expect(evaluate(baseline, baseline, noChanges)).toEqual([]);
  });

  test("a changed file gets no baseline allowance", () => {
    const problems = evaluate(baseline, baseline, new Set(["old.ts"]));
    expect(problems).toEqual([
      { kind: "strict", file: "old.ts", rule: "no-comments", count: 2 },
    ]);
  });

  test("a new file with any violation is strict", () => {
    const current = counts({
      ...flat(baseline),
      "new.ts": { "no-comments": 1 },
    });
    expect(evaluate(current, baseline, new Set(["new.ts"]))).toEqual([
      { kind: "strict", file: "new.ts", rule: "no-comments", count: 1 },
    ]);
  });

  test("an untouched file with more violations than allowed is new", () => {
    const current = counts({
      ...flat(baseline),
      "old.ts": { "no-comments": 3 },
    });
    expect(evaluate(current, baseline, noChanges)).toEqual([
      {
        kind: "new",
        file: "old.ts",
        rule: "no-comments",
        count: 3,
        allowed: 2,
      },
    ]);
  });

  test("an untouched file with a violation missing from the baseline is new", () => {
    const current = counts({
      ...flat(baseline),
      "old.ts": { "no-comments": 2, "no-swallowed-catch": 1 },
    });
    expect(evaluate(current, baseline, noChanges)).toEqual([
      {
        kind: "new",
        file: "old.ts",
        rule: "no-swallowed-catch",
        count: 1,
        allowed: 0,
      },
    ]);
  });

  test("fewer violations than the baseline lists is stale until it shrinks", () => {
    const current = counts({ "other.ts": { "no-swallowed-catch": 1 } });
    expect(evaluate(current, baseline, noChanges)).toEqual([
      {
        kind: "stale",
        file: "old.ts",
        rule: "no-comments",
        count: 0,
        allowed: 2,
      },
    ]);
  });

  test("a changed file that is now clean leaves a stale baseline entry", () => {
    const current = counts({ "other.ts": { "no-swallowed-catch": 1 } });
    expect(evaluate(current, baseline, new Set(["old.ts"]))).toEqual([
      {
        kind: "stale",
        file: "old.ts",
        rule: "no-comments",
        count: 0,
        allowed: 2,
      },
    ]);
  });

  test("a changed file that is clean and not in the baseline is fine", () => {
    expect(evaluate(baseline, baseline, new Set(["clean.ts"]))).toEqual([]);
  });
});
