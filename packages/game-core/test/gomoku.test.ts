import assert from "node:assert/strict";
import test from "node:test";

import {
  createGomokuInitialization,
  GomokuGame,
  parseGomokuMove,
} from "../src/index.js";

test("parses one legal gomoku move", () => {
  assert.deepEqual(parseGomokuMove("7 8\n"), { x: 7, y: 8 });
});

test("rejects extra output and out-of-board moves", () => {
  assert.throws(() => parseGomokuMove("7 8 debug"));
  assert.throws(() => parseGomokuMove("15 0"));
  assert.throws(() => parseGomokuMove("1e0 2"));
});

test("initialization follows the line-based v1 protocol", () => {
  assert.equal(createGomokuInitialization(1), "1\n15 15\n1\n");
});

test("validates turns, occupied positions, and five in a row", () => {
  const game = new GomokuGame();
  for (let y = 0; y < 4; y += 1) {
    assert.deepEqual(game.play(0, { x: 3, y }), { type: "playing" });
    assert.deepEqual(game.play(1, { x: 4, y }), { type: "playing" });
  }
  assert.deepEqual(game.play(0, { x: 3, y: 4 }), {
    type: "win",
    winner: 0,
  });
  assert.throws(() => game.play(1, { x: 3, y: 5 }), /already finished/u);
});
