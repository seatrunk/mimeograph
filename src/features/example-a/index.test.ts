import { expect, test } from "vitest";
import { double } from "./index.ts";

test("example-a dobra o valor e rotula", () => {
  expect(double(4)).toBe("double=8");
});
