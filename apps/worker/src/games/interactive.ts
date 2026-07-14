import type { GameReplay, GameResourceLimits } from "@compintel/contracts";
import type {
  InteractiveJudgeSession,
  JudgeResult,
  JudgeTurnResult,
} from "@compintel/judge-client";
import { JudgePlayerOutputError } from "@compintel/judge-client";

export type EvaluationVerdict =
  | "ACCEPTED"
  | "COMPILE_ERROR"
  | "RUNTIME_ERROR"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "DANGEROUS_SYSCALL"
  | "INVALID_MOVE"
  | "INTERNAL_ERROR";

export const DEFAULT_RESOURCE_LIMITS: GameResourceLimits = {
  moveCpuLimitMs: 100,
  totalCpuLimitMs: 5_000,
  memoryLimitMiB: 256,
};

export const SHARED_STATIC_LIMITS = {
  wallLimitNs: 1_000_000_000,
  maxOutputBytes: 64,
  stackLimitBytes: 128 * 1024 * 1024,
  processLimit: 8,
} as const;

export interface InteractiveStaticLimits {
  readonly wallLimitNs: number;
  readonly maxOutputBytes: number;
  readonly stackLimitBytes: number;
  readonly processLimit: number;
  readonly processClockLimitNs?: number;
}

export interface InteractiveRunResult<TReplay extends GameReplay> {
  verdict: EvaluationVerdict;
  stdout: string;
  playerSandboxResult: JudgeResult;
  opponentSandboxResult: JudgeResult;
  playerTotalCpuNs: number;
  opponentTotalCpuNs: number;
  replay: TReplay;
  errorMessage?: string;
}

export type InteractiveSeat = 0 | 1;

interface InteractiveGame {
  readonly result: { readonly type: string };
}

export interface GameAdapter<
  TGame extends InteractiveGame,
  TMove,
  TReplay extends GameReplay,
> {
  readonly matchWallLimitMs?: number;
  createGame(): TGame;
  createInitialization(game: TGame, seat: InteractiveSeat): string;
  parseMove(game: TGame, output: string): TMove;
  formatMove(move: TMove): string;
  applyMove(game: TGame, seat: InteractiveSeat, move: TMove): void;
  buildReplay(game: TGame, userSeat: InteractiveSeat): TReplay;
}

export async function runInteractiveEvaluation<
  TGame extends InteractiveGame,
  TMove,
  TReplay extends GameReplay,
>(
  playerSession: InteractiveJudgeSession,
  opponentSession: InteractiveJudgeSession,
  userSeat: InteractiveSeat,
  resourceLimits: GameResourceLimits,
  adapter: GameAdapter<TGame, TMove, TReplay>,
): Promise<InteractiveRunResult<TReplay>> {
  const game = adapter.createGame();
  const outputs: string[] = [];
  let playerTotalCpuNs = 0;
  let opponentTotalCpuNs = 0;
  let verdict: EvaluationVerdict = "ACCEPTED";
  let failureMessage: string | undefined;
  let playerSandboxResult!: JudgeResult;
  let opponentSandboxResult!: JudgeResult;
  const inputs: [string, string] = [
    adapter.createInitialization(game, 0),
    adapter.createInitialization(game, 1),
  ];
  let currentSeat: InteractiveSeat = 0;
  const matchWallLimit =
    adapter.matchWallLimitMs === undefined
      ? undefined
      : {
          durationMs: adapter.matchWallLimitMs,
          deadlineMs: Date.now() + adapter.matchWallLimitMs,
        };

  try {
    while (game.result.type === "playing") {
      if (
        matchWallLimit !== undefined &&
        Date.now() >= matchWallLimit.deadlineMs
      ) {
        verdict = "TIME_LIMIT_EXCEEDED";
        failureMessage = `match wall time exceeded ${matchWallLimit.durationMs / 1000}s`;
        break;
      }
      const isPlayerTurn = currentSeat === userSeat;
      const session = isPlayerTurn ? playerSession : opponentSession;
      let turn: JudgeTurnResult;
      try {
        turn = await session.playTurn(inputs[currentSeat]);
        inputs[currentSeat] = "";
      } catch (error) {
        if (!(error instanceof JudgePlayerOutputError)) {
          throw error;
        }
        if (isPlayerTurn) {
          verdict = "INVALID_MOVE";
          failureMessage = error.message;
        } else {
          verdict = "INTERNAL_ERROR";
          failureMessage = `platform opponent produced invalid output: ${error.message}`;
        }
        break;
      }
      if (isPlayerTurn) {
        playerTotalCpuNs = Math.max(playerTotalCpuNs, turn.totalCpu);
      } else {
        opponentTotalCpuNs = Math.max(opponentTotalCpuNs, turn.totalCpu);
      }
      if (turn.type !== "turnCompleted") {
        if (isPlayerTurn) {
          ({ verdict, errorMessage: failureMessage } = verdictForTurn(
            turn,
            resourceLimits,
          ));
        } else {
          verdict = "INTERNAL_ERROR";
          failureMessage = `platform opponent failed: ${verdictForTurn(turn, resourceLimits).errorMessage}`;
        }
        break;
      }

      const output = turn.output ?? "";
      if (isPlayerTurn) outputs.push(output);
      try {
        const move = adapter.parseMove(game, output);
        adapter.applyMove(game, currentSeat, move);
        const otherSeat: InteractiveSeat = currentSeat === 0 ? 1 : 0;
        inputs[otherSeat] += adapter.formatMove(move);
      } catch (error) {
        if (isPlayerTurn) {
          verdict = "INVALID_MOVE";
          failureMessage = errorMessage(error);
        } else {
          verdict = "INTERNAL_ERROR";
          failureMessage = `platform opponent made an invalid move: ${errorMessage(error)}`;
        }
        break;
      }
      if (game.result.type !== "playing") {
        break;
      }
      currentSeat = currentSeat === 0 ? 1 : 0;
    }
  } finally {
    [playerSandboxResult, opponentSandboxResult] = await Promise.all([
      playerSession.finish(),
      opponentSession.finish(),
    ]);
  }
  const playerSandboxFailure = verdictForSandboxFailure(
    playerSandboxResult.status,
  );
  if (playerSandboxFailure !== undefined) {
    verdict = playerSandboxFailure;
    failureMessage ??= `sandbox finished with status: ${playerSandboxResult.status}`;
  }
  const opponentSandboxFailure = verdictForSandboxFailure(
    opponentSandboxResult.status,
  );
  if (opponentSandboxFailure !== undefined && verdict === "ACCEPTED") {
    verdict = "INTERNAL_ERROR";
    failureMessage = `platform opponent sandbox finished with status: ${opponentSandboxResult.status}`;
  }
  return {
    verdict,
    stdout: outputs.join(""),
    playerSandboxResult,
    opponentSandboxResult,
    playerTotalCpuNs,
    opponentTotalCpuNs,
    replay: adapter.buildReplay(game, userSeat),
    ...(failureMessage === undefined ? {} : { errorMessage: failureMessage }),
  };
}

function verdictForSandboxFailure(
  status: string,
): EvaluationVerdict | undefined {
  switch (status) {
    case "Time Limit Exceeded":
      return "TIME_LIMIT_EXCEEDED";
    case "Memory Limit Exceeded":
      return "MEMORY_LIMIT_EXCEEDED";
    case "Output Limit Exceeded":
      return "OUTPUT_LIMIT_EXCEEDED";
    case "Dangerous Syscall":
      return "DANGEROUS_SYSCALL";
    case "Internal Error":
    case "File Error":
      return "INTERNAL_ERROR";
    default:
      return undefined;
  }
}

function verdictForTurn(
  turn: JudgeTurnResult,
  resourceLimits: GameResourceLimits,
): {
  verdict: EvaluationVerdict;
  errorMessage: string;
} {
  switch (turn.type) {
    case "moveCpuLimitExceeded":
      return {
        verdict: "TIME_LIMIT_EXCEEDED",
        errorMessage: `single-turn CPU time exceeded ${resourceLimits.moveCpuLimitMs}ms`,
      };
    case "totalCpuLimitExceeded":
      return {
        verdict: "TIME_LIMIT_EXCEEDED",
        errorMessage: `total CPU time exceeded ${resourceLimits.totalCpuLimitMs}ms`,
      };
    case "moveWallLimitExceeded":
      return {
        verdict: "TIME_LIMIT_EXCEEDED",
        errorMessage: "single-turn wall time exceeded 1s",
      };
    case "turnOutputLimitExceeded":
      return {
        verdict: "OUTPUT_LIMIT_EXCEEDED",
        errorMessage:
          "turn output exceeded 64 bytes or did not end with a newline",
      };
    case "processExited":
      return {
        verdict: "RUNTIME_ERROR",
        errorMessage:
          turn.error ?? "player process exited before producing a move",
      };
    case "controlError":
      return {
        verdict: "INTERNAL_ERROR",
        errorMessage: turn.error ?? "go-judge turn control failed",
      };
    case "turnCompleted":
      throw new Error("completed turn does not have an error verdict");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "invalid player output";
}
