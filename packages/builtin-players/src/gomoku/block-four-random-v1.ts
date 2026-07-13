import type { GomokuGame, GomokuMove, GomokuSeat } from "@compintel/game-core";

import type { GomokuBuiltinPlayerImplementation } from "../types.js";

export const BLOCK_FOUR_RANDOM_V1_KEY = "gomoku:block-four-random:v1";

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

export const blockFourRandomV1: GomokuBuiltinPlayerImplementation = {
  gameSlug: "gomoku",
  implementationKey: BLOCK_FOUR_RANDOM_V1_KEY,
  create({ random }) {
    return {
      chooseMove(game, seat) {
        assertCanMove(game, seat);
        const opponent = seat === 0 ? 1 : 0;
        for (const [dx, dy] of DIRECTIONS) {
          for (let x = 0; x < game.height; x += 1) {
            for (let y = 0; y < game.width; y += 1) {
              const start = { x, y };
              if (game.at(start) !== opponent) {
                continue;
              }
              const before = { x: x - dx, y: y - dy };
              if (inside(game, before) && game.at(before) === opponent) {
                continue;
              }

              let runLength = 0;
              let cursor = start;
              while (inside(game, cursor) && game.at(cursor) === opponent) {
                runLength += 1;
                cursor = { x: cursor.x + dx, y: cursor.y + dy };
              }
              if (runLength >= 4) {
                if (game.isEmpty(before)) {
                  return before;
                }
                if (game.isEmpty(cursor)) {
                  return cursor;
                }
              }
            }
          }
        }

        const empty = game.emptyMoves();
        if (empty.length === 0) {
          throw new Error("gomoku board has no empty position");
        }
        const value = random();
        const normalized = Number.isFinite(value)
          ? Math.min(Math.max(value, 0), 1 - Number.EPSILON)
          : 0;
        return empty[Math.floor(normalized * empty.length)]!;
      },
    };
  },
};

function assertCanMove(game: GomokuGame, seat: GomokuSeat): void {
  if (game.result.type !== "playing") {
    throw new Error("cannot choose a move for a finished gomoku game");
  }
  if (game.nextSeat !== seat) {
    throw new Error(`it is seat ${game.nextSeat}'s turn`);
  }
}

function inside(game: GomokuGame, move: GomokuMove): boolean {
  return (
    move.x >= 0 && move.x < game.height && move.y >= 0 && move.y < game.width
  );
}
