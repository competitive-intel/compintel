import assert from "node:assert/strict";
import test from "node:test";

import { evaluationWorkerStatusSchema } from "../src/index.js";

test("parses evaluation worker availability", () => {
  assert.deepEqual(
    evaluationWorkerStatusSchema.parse({ online: false, workerCount: 0 }),
    { online: false, workerCount: 0 },
  );
  assert.equal(
    evaluationWorkerStatusSchema.safeParse({ online: true, workerCount: -1 })
      .success,
    false,
  );
});
