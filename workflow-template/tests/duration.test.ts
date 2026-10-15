import { test } from "node:test";
import assert from "node:assert/strict";
import { duration } from "../templates/viewer/duration";

test("quick runs show tenths instead of 0s, longer runs keep whole seconds and minutes", () => {
  for (const [ms, expected] of [
    [0, "0.0s"],
    [103, "0.1s"],
    [870, "0.8s"],
    [3259, "3.2s"],
    [44298, "44s"],
    [125700, "2m 5s"],
    [-50, "0.0s"],
  ] as const)
    assert.equal(duration(ms), expected);
});
