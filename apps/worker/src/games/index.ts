import type { GameReplay, GameResourceLimits } from "@compintel/contracts";
import type { InteractiveJudgeSession } from "@compintel/judge-client";
import type { Logger } from "@compintel/logger";

import { GOMOKU_STATIC_LIMITS, runGomokuEvaluation } from "./gomoku.js";
import type {
  InteractiveRunResult,
  InteractiveSeat,
  InteractiveStaticLimits,
} from "./interactive.js";
import {
  QUORIDOR_MATCH_WALL_MS,
  QUORIDOR_STATIC_LIMITS,
  runQuoridorEvaluation,
} from "./quoridor.js";

export interface EvaluationGame {
  staticLimits: InteractiveStaticLimits;
  runEvaluation(
    playerSession: InteractiveJudgeSession,
    opponentSession: InteractiveJudgeSession,
    userSeat: InteractiveSeat,
    resourceLimits: GameResourceLimits,
    logger?: Logger,
  ): Promise<InteractiveRunResult<GameReplay>>;
}

const EVALUATION_GAMES: Record<string, EvaluationGame> = {
  gomoku: {
    staticLimits: GOMOKU_STATIC_LIMITS,
    runEvaluation: runGomokuEvaluation,
  },
  quoridor: {
    staticLimits: QUORIDOR_STATIC_LIMITS,
    runEvaluation: runQuoridorEvaluation,
  },
};

export function getEvaluationGame(
  gameSlug: string,
): EvaluationGame | undefined {
  return EVALUATION_GAMES[gameSlug];
}

export { QUORIDOR_MATCH_WALL_MS, runGomokuEvaluation, runQuoridorEvaluation };
export type { InteractiveStaticLimits };
