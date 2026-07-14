import assert from "node:assert/strict";
import test from "node:test";

import {
  createQuoridorInitialization,
  formatQuoridorMove,
  parseQuoridorMove,
  QuoridorGame,
} from "../src/index.js";

test("parses and formats protocol v1 moves", () => {
  assert.deepEqual(parseQuoridorMove("0 4 1\n"), { type: 0, x: 4, y: 1 });
  assert.deepEqual(parseQuoridorMove("1 5 6 0\n"), {
    type: 1,
    x: 5,
    y: 6,
    orientation: 0,
  });
  assert.equal(createQuoridorInitialization(1), "1 1\n");
  assert.equal(
    formatQuoridorMove({ type: 1, x: 3, y: 4, orientation: 1 }),
    "1 3 4 1\n",
  );
});

test("rejects malformed protocol output", () => {
  assert.throws(() => parseQuoridorMove("0 4"));
  assert.throws(() => parseQuoridorMove("0 4 1 debug"));
  assert.throws(() => parseQuoridorMove("1 4 1 2"));
  assert.throws(() => parseQuoridorMove("0 -1 2"));
});

test("starts in the middle and supports ordinary movement", () => {
  const game = new QuoridorGame();
  assert.deepEqual(game.pawn(0), { x: 4, y: 0 });
  assert.deepEqual(game.pawn(1), { x: 4, y: 8 });
  assert.equal(game.wallsRemaining(0), 10);
  game.play(0, { type: 0, x: 4, y: 1 });
  assert.deepEqual(game.pawn(0), { x: 4, y: 1 });
  assert.throws(() => game.play(1, { type: 0, x: 4, y: 6 }));
});

test("jumps an adjacent pawn and uses diagonal moves when blocked behind", () => {
  const jumpGame = gameWithPawnsFacing();
  assert.ok(
    jumpGame
      .legalPawnMoves(0)
      .some((position) => position.x === 4 && position.y === 7),
  );

  const diagonalGame = gameWithPawnsFacing();
  diagonalGame.play(0, { type: 1, x: 4, y: 7, orientation: 1 });
  diagonalGame.play(1, { type: 1, x: 8, y: 1, orientation: 0 });
  const moves = diagonalGame.legalPawnMoves(0);
  assert.ok(moves.some((position) => position.x === 3 && position.y === 5));
  assert.ok(moves.some((position) => position.x === 5 && position.y === 5));
  assert.ok(!moves.some((position) => position.x === 4 && position.y === 6));
});

test("walls block movement and cannot overlap or cross", () => {
  const game = new QuoridorGame();
  game.play(0, { type: 1, x: 4, y: 1, orientation: 1 });
  game.play(1, { type: 0, x: 4, y: 7 });
  assert.ok(
    !game
      .legalPawnMoves(0)
      .some((position) => position.x === 4 && position.y === 1),
  );
  assert.throws(() => game.play(0, { type: 1, x: 5, y: 1, orientation: 1 }));
  assert.throws(() => game.play(0, { type: 1, x: 4, y: 1, orientation: 0 }));
});

test("rejects a wall that removes the final route to a goal", () => {
  const game = new QuoridorGame();
  const walls = [
    { x: 7, y: 6, orientation: 0 },
    { x: 1, y: 1, orientation: 0 },
    { x: 3, y: 8, orientation: 1 },
    { x: 1, y: 5, orientation: 0 },
    { x: 8, y: 7, orientation: 1 },
    { x: 3, y: 3, orientation: 1 },
    { x: 4, y: 1, orientation: 0 },
    { x: 3, y: 7, orientation: 1 },
    { x: 6, y: 1, orientation: 1 },
    { x: 4, y: 5, orientation: 0 },
    { x: 2, y: 4, orientation: 0 },
    { x: 5, y: 7, orientation: 1 },
    { x: 8, y: 2, orientation: 0 },
    { x: 3, y: 2, orientation: 1 },
    { x: 5, y: 8, orientation: 0 },
    { x: 1, y: 8, orientation: 1 },
    { x: 5, y: 3, orientation: 1 },
  ] as const;
  for (const [index, wall] of walls.entries()) {
    game.play((index % 2) as 0 | 1, { type: 1, ...wall });
  }
  assert.throws(
    () => game.play(1, { type: 1, x: 4, y: 7, orientation: 0 }),
    /every path/u,
  );
});

test("wins after reaching the opposite edge", () => {
  const game = new QuoridorGame();
  for (let y = 1; y <= 8; y += 1) {
    const result = game.play(0, { type: 0, x: 4, y });
    if (y === 8) {
      assert.deepEqual(result, { type: "win", winner: 0 });
      break;
    }
    game.play(1, { type: 0, x: y % 2 === 1 ? 3 : 4, y: 8 });
  }
});

function gameWithPawnsFacing(): QuoridorGame {
  const game = new QuoridorGame();
  for (let y = 1; y <= 4; y += 1) {
    game.play(0, { type: 0, x: 4, y });
    game.play(1, { type: 0, x: y % 2 === 1 ? 3 : 4, y: 8 });
  }
  game.play(0, { type: 0, x: 4, y: 5 });
  game.play(1, { type: 0, x: 4, y: 7 });
  game.play(0, { type: 1, x: 1, y: 1, orientation: 0 });
  game.play(1, { type: 0, x: 4, y: 6 });
  return game;
}
