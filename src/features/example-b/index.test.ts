import { expect, test } from "vitest";
import { describeDouble } from "./index.ts";

test("example-b usa a porta publica de example-a", () => {
  expect(describeDouble(3)).toBe("resultado double=6");
});
