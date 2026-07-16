import type { QuoridorReplay } from "@compintel/contracts";

export function quoridorReplayFixture(
  overrides: Partial<QuoridorReplay> = {},
): QuoridorReplay {
  return {
    gameSlug: "quoridor",
    userSeat: 0,
    moves: [
      { type: 0, x: 4, y: 1, seat: 0 },
      { type: 1, x: 3, y: 7, orientation: 1, seat: 1 },
      { type: 1, x: 5, y: 2, orientation: 0, seat: 0 },
    ],
    result: { type: "win", winner: 0 },
    ...overrides,
  };
}
