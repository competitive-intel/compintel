import assert from "node:assert/strict";
import test from "node:test";

import { calculateWeightedScore } from "../src/evaluation-scoring.js";

test("floors the weighted percentage of defeated opponents", () => {
  assert.equal(
    calculateWeightedScore([
      { status: "FINISHED", opponentWeight: 1, won: true },
      { status: "FINISHED", opponentWeight: 2, won: false },
      { status: "FINISHED", opponentWeight: 3, won: true },
    ]),
    66,
  );
});

test("does not calculate a score until every evaluation finishes", () => {
  assert.equal(
    calculateWeightedScore([
      { status: "FINISHED", opponentWeight: 1, won: true },
      { status: "RUNNING", opponentWeight: 2, won: false },
    ]),
    null,
  );
});

test("returns zero when no opponent was defeated", () => {
  assert.equal(
    calculateWeightedScore([
      { status: "FINISHED", opponentWeight: 5, won: false },
    ]),
    0,
  );
});
