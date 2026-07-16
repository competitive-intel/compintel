import {
  createGomokuInitialization,
  formatGomokuMove,
  GomokuGame,
  parseGomokuMove,
  type GomokuMove,
  type GomokuSeat,
} from "@compintel/game-core";
import type { GomokuReplay, GameResourceLimits } from "@compintel/contracts";
import type { InteractiveJudgeSession } from "@compintel/judge-client";
import type { Logger } from "@compintel/logger";

import {
  DEFAULT_RESOURCE_LIMITS,
  runInteractiveEvaluation,
  SHARED_STATIC_LIMITS,
  type GameAdapter,
  type InteractiveRunResult,
} from "./interactive.js";

export const GOMOKU_STATIC_LIMITS = {
  ...SHARED_STATIC_LIMITS,
} as const;

type GomokuRunResult = InteractiveRunResult<GomokuReplay>;

const GOMOKU_ADAPTER: GameAdapter<GomokuGame, GomokuMove, GomokuReplay> = {
  createGame: () => new GomokuGame(),
  createInitialization: (game, seat) =>
    createGomokuInitialization(seat, game.height, game.width),
  parseMove: (game, output) => parseGomokuMove(output, game.height, game.width),
  formatMove: formatGomokuMove,
  applyMove: (game, seat, move) => {
    game.play(seat, move);
  },
  buildReplay: (game, userSeat) => ({
    gameSlug: "gomoku",
    height: game.height,
    width: game.width,
    userSeat,
    moves: [...game.moves],
    result: game.result,
  }),
};

export async function runGomokuEvaluation(
  playerSession: InteractiveJudgeSession,
  opponentSession: InteractiveJudgeSession,
  userSeat: GomokuSeat = 1,
  resourceLimits: GameResourceLimits = DEFAULT_RESOURCE_LIMITS,
  logger?: Logger,
): Promise<GomokuRunResult> {
  return runInteractiveEvaluation(
    playerSession,
    opponentSession,
    userSeat,
    resourceLimits,
    GOMOKU_ADAPTER,
    logger,
  );
}
