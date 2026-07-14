import type { GomokuReplay } from "@compintel/contracts";

export function gomokuReplayFixture(
  overrides: Partial<GomokuReplay> = {},
): GomokuReplay {
  return {
    gameSlug: "gomoku",
    width: 3,
    height: 3,
    userSeat: 0,
    moves: [
      { x: 0, y: 0, seat: 0 },
      { x: 1, y: 1, seat: 1 },
      { x: 2, y: 0, seat: 0 },
    ],
    result: { type: "win", winner: 0 },
    ...overrides,
  };
}
