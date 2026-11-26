import { label } from "#shared/text.ts";
import { doubler } from "./doubler.ts";

export function double(value: number): string {
  return label("double", doubler(value));
}
