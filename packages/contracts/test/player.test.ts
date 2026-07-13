import assert from "node:assert/strict";
import test from "node:test";

import { createPlayerSchema } from "../src/index.js";

test("validates a C++ player submission", () => {
  const input = createPlayerSchema.parse({
    name: "center-first",
    sourceCode: "int main() {}",
  });
  assert.equal(input.name, "center-first");
});

test("rejects an empty source file", () => {
  assert.throws(() =>
    createPlayerSchema.parse({ name: "empty", sourceCode: "" }),
  );
});
