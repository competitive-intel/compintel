import assert from "node:assert/strict";
import test from "node:test";

import { GomokuGame } from "@compintel/game-core";

import {
  BLOCK_FOUR_RANDOM_V1_KEY,
  blockFourRandomV1,
  resolveBuiltinPlayer,
} from "../src/index.js";

test("resolves the immutable implementation by key", () => {
  assert.equal(
    resolveBuiltinPlayer("gomoku", BLOCK_FOUR_RANDOM_V1_KEY),
    blockFourRandomV1,
  );
  assert.throws(() => resolveBuiltinPlayer("gomoku", "missing"), /unknown/u);
});

test("blocks an open end of four connected opponent stones", () => {
  const player = blockFourRandomV1.create({ random: () => 0.9 });
  const game = new GomokuGame();
  game.play(0, { x: 7, y: 3 });
  game.play(1, { x: 0, y: 0 });
  game.play(0, { x: 7, y: 4 });
  game.play(1, { x: 0, y: 1 });
  game.play(0, { x: 7, y: 5 });
  game.play(1, { x: 0, y: 2 });
  game.play(0, { x: 7, y: 6 });

  assert.deepEqual(player.chooseMove(game, 1), {
    x: 7,
    y: 2,
  });
});

test("chooses an empty position using the supplied RNG", () => {
  const player = blockFourRandomV1.create({ random: () => 0 });
  const game = new GomokuGame();
  game.play(0, { x: 0, y: 0 });
  assert.deepEqual(player.chooseMove(game, 1), {
    x: 0,
    y: 1,
  });
});
