import assert from "node:assert/strict";
import test from "node:test";

import { updateGameSchema } from "../src/game.js";

test("game update requires at least one changed field", () => {
  assert.equal(updateGameSchema.safeParse({}).success, false);
  assert.deepEqual(updateGameSchema.parse({ isPublished: true }), {
    isPublished: true,
  });
});

test("validates editable game resource limits", () => {
  assert.deepEqual(
    updateGameSchema.parse({
      resourceLimits: {
        moveCpuLimitMs: 250,
        totalCpuLimitMs: 10_000,
        memoryLimitMiB: 512,
      },
    }),
    {
      resourceLimits: {
        moveCpuLimitMs: 250,
        totalCpuLimitMs: 10_000,
        memoryLimitMiB: 512,
      },
    },
  );
  assert.equal(
    updateGameSchema.safeParse({
      resourceLimits: {
        moveCpuLimitMs: 5_001,
        totalCpuLimitMs: 5_000,
        memoryLimitMiB: 256,
      },
    }).success,
    false,
  );
});
