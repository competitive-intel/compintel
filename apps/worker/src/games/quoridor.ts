import {
  createQuoridorInitialization,
  formatQuoridorMove,
  parseQuoridorMove,
  QuoridorGame,
  type QuoridorMove,
  type QuoridorSeat,
} from "@compintel/game-core";
import type { GameResourceLimits, QuoridorReplay } from "@compintel/contracts";
import type { InteractiveJudgeSession } from "@compintel/judge-client";

import {
  DEFAULT_RESOURCE_LIMITS,
  runInteractiveEvaluation,
  SHARED_STATIC_LIMITS,
  type GameAdapter,
  type InteractiveRunResult,
} from "./interactive.js";

/** Whole-match wall clock for quoridor (also applied as process clockLimit). */
export const QUORIDOR_MATCH_WALL_MS = 300_000;

export const QUORIDOR_STATIC_LIMITS = {
  ...SHARED_STATIC_LIMITS,
  processClockLimitNs: QUORIDOR_MATCH_WALL_MS * 1_000_000,
} as const;

type QuoridorRunResult = InteractiveRunResult<QuoridorReplay>;

const QUORIDOR_ADAPTER: GameAdapter<
  QuoridorGame,
  QuoridorMove,
  QuoridorReplay
> = {
  matchWallLimitMs: QUORIDOR_MATCH_WALL_MS,
  createGame: () => new QuoridorGame(),
  createInitialization: (_game, seat) => createQuoridorInitialization(seat),
  parseMove: (_game, output) => parseQuoridorMove(output),
  formatMove: formatQuoridorMove,
  applyMove: (game, seat, move) => {
    game.play(seat, move);
  },
  buildReplay: (game, userSeat) => ({
    gameSlug: "quoridor",
    userSeat,
    moves: [...game.moves],
    result: game.result,
  }),
};

export async function runQuoridorEvaluation(
  playerSession: InteractiveJudgeSession,
  opponentSession: InteractiveJudgeSession,
  userSeat: QuoridorSeat = 1,
  resourceLimits: GameResourceLimits = DEFAULT_RESOURCE_LIMITS,
): Promise<QuoridorRunResult> {
  return runInteractiveEvaluation(
    playerSession,
    opponentSession,
    userSeat,
    resourceLimits,
    QUORIDOR_ADAPTER,
  );
}
