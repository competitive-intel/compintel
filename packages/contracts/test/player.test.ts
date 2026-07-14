import assert from "node:assert/strict";
import test from "node:test";

import {
  createBuiltinPlayerSchema,
  createPlayerSchema,
  playerNameListSchema,
  submissionAcceptedSchema,
  updateBuiltinPlayerSchema,
} from "../src/index.js";

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

test("accepts every evaluation created for a submitted version", () => {
  const response = submissionAcceptedSchema.parse({
    playerId: "player-1",
    playerVersionId: "version-1",
    version: 1,
    evaluationIds: ["evaluation-1", "evaluation-2"],
    evaluationStatus: "QUEUED",
  });
  assert.equal(response.evaluationIds.length, 2);
});

test("validates player names used for submission autocomplete", () => {
  assert.deepEqual(playerNameListSchema.parse({ names: ["alpha", "beta"] }), {
    names: ["alpha", "beta"],
  });
});

test("validates an administrator-created C++ platform player", () => {
  assert.deepEqual(
    createBuiltinPlayerSchema.parse({
      name: "基准程序",
      sourceCode: "int main() {}",
    }),
    {
      name: "基准程序",
      sourceCode: "int main() {}",
      isActive: true,
      weight: 1,
    },
  );
  assert.equal(
    updateBuiltinPlayerSchema.safeParse({ isActive: false }).success,
    true,
  );
  assert.equal(
    updateBuiltinPlayerSchema.safeParse({ weight: 0 }).success,
    false,
  );
  assert.equal(updateBuiltinPlayerSchema.safeParse({}).success, false);
});
