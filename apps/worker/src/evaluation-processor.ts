import {
  createGomokuInitialization,
  formatGomokuMove,
  GomokuGame,
  parseGomokuMove,
  createQuoridorInitialization,
  formatQuoridorMove,
  parseQuoridorMove,
  QuoridorGame,
  type GomokuSeat,
  type QuoridorSeat,
} from "@compintel/game-core";
import type {
  GameReplay,
  GameResourceLimits,
  GomokuReplay,
  QuoridorReplay,
} from "@compintel/contracts";
import type {
  InteractiveJudgeSession,
  JudgeClient,
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

export interface EvaluationSource {
  status: "QUEUED" | "COMPILING" | "RUNNING" | "FINISHED";
  sourceCode: string;
  gameSlug: string;
  resourceLimits: GameResourceLimits;
  opponent: {
    sourceCode: string;
  };
}

export interface FinishEvaluationInput {
  verdict: EvaluationVerdict;
  compileStatus?: string | undefined;
  compileLog?: string | undefined;
  opponentCompileStatus?: string | undefined;
  opponentCompileLog?: string | undefined;
  runStatus?: string | undefined;
  opponentRunStatus?: string | undefined;
  stdout?: string | undefined;
  stderr?: string | undefined;
  opponentStderr?: string | undefined;
  cpuTimeNs?: bigint | undefined;
  wallTimeNs?: bigint | undefined;
  memoryBytes?: bigint | undefined;
  opponentCpuTimeNs?: bigint | undefined;
  opponentWallTimeNs?: bigint | undefined;
  opponentMemoryBytes?: bigint | undefined;
  errorMessage?: string | undefined;
  replay?: GameReplay | undefined;
}

export interface EvaluationRepository {
  start(evaluationId: string): Promise<EvaluationSource | null>;
  markRunning(
    evaluationId: string,
    compileStatus: string,
    compileLog: string,
  ): Promise<void>;
  finish(evaluationId: string, result: FinishEvaluationInput): Promise<void>;
}

const DEFAULT_GOMOKU_RESOURCE_LIMITS: GameResourceLimits = {
  moveCpuLimitMs: 100,
  totalCpuLimitMs: 5_000,
  memoryLimitMiB: 256,
};

const SHARED_STATIC_LIMITS = {
  wallLimitNs: 1_000_000_000,
  maxOutputBytes: 64,
  stackLimitBytes: 128 * 1024 * 1024,
  processLimit: 8,
} as const;

const GOMOKU_STATIC_LIMITS = {
  ...SHARED_STATIC_LIMITS,
} as const;

/** Whole-match wall clock for quoridor (also applied as process clockLimit). */
export const QUORIDOR_MATCH_WALL_MS = 300_000;

const QUORIDOR_STATIC_LIMITS = {
  ...SHARED_STATIC_LIMITS,
  processClockLimitNs: QUORIDOR_MATCH_WALL_MS * 1_000_000,
} as const;

interface GomokuRunResult {
  verdict: EvaluationVerdict;
  stdout: string;
  playerSandboxResult: JudgeResult;
  opponentSandboxResult: JudgeResult;
  playerTotalCpuNs: number;
  opponentTotalCpuNs: number;
  replay: GomokuReplay;
  errorMessage?: string;
}

export class EvaluationProcessor {
  constructor(
    private readonly repository: EvaluationRepository,
    private readonly judge: JudgeClient,
  ) {}

  async process(evaluationId: string): Promise<void> {
    const evaluation = await this.repository.start(evaluationId);
    if (evaluation === null) {
      throw new Error(`evaluation ${evaluationId} does not exist`);
    }
    if (evaluation.status === "FINISHED") {
      return;
    }
    if (
      evaluation.gameSlug !== "gomoku" &&
      evaluation.gameSlug !== "quoridor"
    ) {
      throw new Error(`unsupported game: ${evaluation.gameSlug}`);
    }
    const compilation = await this.judge.compileCpp(evaluation.sourceCode);
    const compileLog = compilation.result.files?.stderr ?? "";
    if (
      compilation.result.status !== "Accepted" ||
      compilation.executableFileId === null
    ) {
      await this.repository.finish(evaluationId, {
        verdict:
          compilation.result.status === "Accepted"
            ? "INTERNAL_ERROR"
            : verdictForStatus(compilation.result.status, true),
        compileStatus: compilation.result.status,
        compileLog,
        errorMessage:
          compilation.executableFileId === null &&
          compilation.result.status === "Accepted"
            ? "go-judge did not return a compiled artifact"
            : compilation.result.error,
      });
      return;
    }

    const executableFileId = compilation.executableFileId;
    try {
      const opponentCompilation = await this.judge.compileCpp(
        evaluation.opponent.sourceCode,
      );
      const opponentCompileLog = opponentCompilation.result.files?.stderr ?? "";
      if (
        opponentCompilation.result.status !== "Accepted" ||
        opponentCompilation.executableFileId === null
      ) {
        await this.repository.finish(evaluationId, {
          verdict: "INTERNAL_ERROR",
          compileStatus: compilation.result.status,
          compileLog,
          opponentCompileStatus: opponentCompilation.result.status,
          opponentCompileLog,
          errorMessage:
            opponentCompilation.executableFileId === null &&
            opponentCompilation.result.status === "Accepted"
              ? "go-judge did not return an artifact for the platform opponent"
              : `platform opponent compilation failed: ${opponentCompilation.result.error ?? opponentCompilation.result.status}`,
        });
        return;
      }

      const opponentExecutableFileId = opponentCompilation.executableFileId;
      try {
        const [playerSession, opponentSession] = await startBothSessions(
          this.judge,
          executableFileId,
          opponentExecutableFileId,
          evaluation.resourceLimits,
          evaluation.gameSlug === "quoridor"
            ? QUORIDOR_STATIC_LIMITS
            : GOMOKU_STATIC_LIMITS,
        );
        await this.repository.markRunning(
          evaluationId,
          compilation.result.status,
          compileLog,
        );
        const run =
          evaluation.gameSlug === "gomoku"
            ? await runGomokuEvaluation(
                playerSession,
                opponentSession,
                1,
                evaluation.resourceLimits,
              )
            : await runQuoridorEvaluation(
                playerSession,
                opponentSession,
                1,
                evaluation.resourceLimits,
              );
        const playerSandbox = run.playerSandboxResult;
        const opponentSandbox = run.opponentSandboxResult;
        await this.repository.finish(evaluationId, {
          verdict: run.verdict,
          compileStatus: compilation.result.status,
          compileLog,
          opponentCompileStatus: opponentCompilation.result.status,
          opponentCompileLog,
          runStatus: playerSandbox.status,
          opponentRunStatus: opponentSandbox.status,
          stdout: run.stdout,
          stderr: playerSandbox.files?.stderr ?? "",
          opponentStderr: opponentSandbox.files?.stderr ?? "",
          cpuTimeNs: BigInt(Math.max(playerSandbox.time, run.playerTotalCpuNs)),
          wallTimeNs: BigInt(playerSandbox.runTime),
          memoryBytes: BigInt(playerSandbox.memory),
          opponentCpuTimeNs: BigInt(
            Math.max(opponentSandbox.time, run.opponentTotalCpuNs),
          ),
          opponentWallTimeNs: BigInt(opponentSandbox.runTime),
          opponentMemoryBytes: BigInt(opponentSandbox.memory),
          replay: run.replay,
          ...(run.errorMessage === undefined
            ? {}
            : { errorMessage: run.errorMessage }),
        });
      } finally {
        await this.judge
          .deleteFile(opponentExecutableFileId)
          .catch(() => undefined);
      }
    } finally {
      await this.judge.deleteFile(executableFileId).catch(() => undefined);
    }
  }
}

interface QuoridorRunResult {
  verdict: EvaluationVerdict;
  stdout: string;
  playerSandboxResult: JudgeResult;
  opponentSandboxResult: JudgeResult;
  playerTotalCpuNs: number;
  opponentTotalCpuNs: number;
  replay: QuoridorReplay;
  errorMessage?: string;
}

export async function runQuoridorEvaluation(
  playerSession: InteractiveJudgeSession,
  opponentSession: InteractiveJudgeSession,
  userSeat: QuoridorSeat = 1,
  resourceLimits: GameResourceLimits = DEFAULT_GOMOKU_RESOURCE_LIMITS,
): Promise<QuoridorRunResult> {
  const game = new QuoridorGame();
  const outputs: string[] = [];
  let playerTotalCpuNs = 0;
  let opponentTotalCpuNs = 0;
  let verdict: EvaluationVerdict = "ACCEPTED";
  let failureMessage: string | undefined;
  let playerSandboxResult!: JudgeResult;
  let opponentSandboxResult!: JudgeResult;
  const inputs: [string, string] = [
    createQuoridorInitialization(0),
    createQuoridorInitialization(1),
  ];
  let currentSeat: QuoridorSeat = 0;
  const matchDeadlineMs = Date.now() + QUORIDOR_MATCH_WALL_MS;

  try {
    while (game.result.type === "playing") {
      if (Date.now() >= matchDeadlineMs) {
        verdict = "TIME_LIMIT_EXCEEDED";
        failureMessage = `match wall time exceeded ${QUORIDOR_MATCH_WALL_MS / 1000}s`;
        break;
      }
      const isPlayerTurn = currentSeat === userSeat;
      const session = isPlayerTurn ? playerSession : opponentSession;
      let turn: JudgeTurnResult;
      try {
        turn = await session.playTurn(inputs[currentSeat]);
        inputs[currentSeat] = "";
      } catch (error) {
        if (!(error instanceof JudgePlayerOutputError)) throw error;
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
        const move = parseQuoridorMove(output);
        game.play(currentSeat, move);
        const otherSeat: QuoridorSeat = currentSeat === 0 ? 1 : 0;
        inputs[otherSeat] += formatQuoridorMove(move);
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
      if (game.result.type !== "playing") break;
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
    replay: {
      gameSlug: "quoridor",
      userSeat,
      moves: [...game.moves],
      result: game.result,
    },
    ...(failureMessage === undefined ? {} : { errorMessage: failureMessage }),
  };
}

export async function runGomokuEvaluation(
  playerSession: InteractiveJudgeSession,
  opponentSession: InteractiveJudgeSession,
  userSeat: GomokuSeat = 1,
  resourceLimits: GameResourceLimits = DEFAULT_GOMOKU_RESOURCE_LIMITS,
): Promise<GomokuRunResult> {
  const game = new GomokuGame();
  const outputs: string[] = [];
  let playerTotalCpuNs = 0;
  let opponentTotalCpuNs = 0;
  let verdict: EvaluationVerdict = "ACCEPTED";
  let failureMessage: string | undefined;
  let playerSandboxResult!: JudgeResult;
  let opponentSandboxResult!: JudgeResult;
  const inputs: [string, string] = [
    createGomokuInitialization(0),
    createGomokuInitialization(1),
  ];
  let currentSeat: GomokuSeat = 0;

  try {
    while (game.result.type === "playing") {
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
        const move = parseGomokuMove(output, game.height, game.width);
        game.play(currentSeat, move);
        const otherSeat: GomokuSeat = currentSeat === 0 ? 1 : 0;
        inputs[otherSeat] += formatGomokuMove(move);
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
    replay: {
      gameSlug: "gomoku",
      height: game.height,
      width: game.width,
      userSeat,
      moves: [...game.moves],
      result: game.result,
    },
    ...(failureMessage === undefined ? {} : { errorMessage: failureMessage }),
  };
}

async function startBothSessions(
  judge: JudgeClient,
  playerExecutableFileId: string,
  opponentExecutableFileId: string,
  resourceLimits: GameResourceLimits,
  staticLimits:
    | typeof GOMOKU_STATIC_LIMITS
    | typeof QUORIDOR_STATIC_LIMITS = GOMOKU_STATIC_LIMITS,
): Promise<[InteractiveJudgeSession, InteractiveJudgeSession]> {
  const limits = {
    ...staticLimits,
    moveCpuLimitNs: resourceLimits.moveCpuLimitMs * 1_000_000,
    totalCpuLimitNs: resourceLimits.totalCpuLimitMs * 1_000_000,
    memoryLimitBytes: resourceLimits.memoryLimitMiB * 1024 * 1024,
  };
  const started = await Promise.allSettled([
    judge.startInteractive(playerExecutableFileId, limits),
    judge.startInteractive(opponentExecutableFileId, limits),
  ]);
  const failure = started.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure !== undefined) {
    await Promise.allSettled(
      started.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.finish()] : [],
      ),
    );
    throw failure.reason;
  }
  const player = started[0];
  const opponent = started[1];
  if (player?.status !== "fulfilled" || opponent?.status !== "fulfilled") {
    throw new Error("failed to start both sandbox sessions");
  }
  return [player.value, opponent.value];
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

function verdictForStatus(
  status: string,
  compiling: boolean,
): EvaluationVerdict {
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
    case "Non Zero Exit Status":
    case "Nonzero Exit Status":
    case "Signalled":
      return compiling ? "COMPILE_ERROR" : "RUNTIME_ERROR";
    default:
      return compiling ? "COMPILE_ERROR" : "INTERNAL_ERROR";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "invalid player output";
}
