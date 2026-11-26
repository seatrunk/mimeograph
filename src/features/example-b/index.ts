import { double } from "#features/example-a";

export function describeDouble(value: number): string {
  return `resultado ${double(value)}`;
}
