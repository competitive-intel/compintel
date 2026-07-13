import {
  resolveBuiltinPlayer,
  type GomokuBuiltinPlayerImplementation,
} from "@compintel/builtin-players";
import {
  createGomokuInitialization,
  formatGomokuMove,
  GomokuGame,
  parseGomokuMove,
  type GomokuSeat,
} from "@compintel/game-core";
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
  sourceCode: string | null;
  language: "CPP" | "BUILTIN";
  gameSlug: string;
  opponent: {
    playerVersionId: string;
    language: "BUILTIN";
    implementationKey: string;
  };
}

export interface FinishEvaluationInput {
  verdict: EvaluationVerdict;
  compileStatus?: string | undefined;
  compileLog?: string | undefined;
  runStatus?: string | undefined;
  stdout?: string | undefined;
  stderr?: string | undefined;
  cpuTimeNs?: bigint | undefined;
  wallTimeNs?: bigint | undefined;
  memoryBytes?: bigint | undefined;
  errorMessage?: string | undefined;
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

const GOMOKU_LIMITS = {
  moveCpuLimitNs: 100_000_000,
  totalCpuLimitNs: 5_000_000_000,
  wallLimitNs: 1_000_000_000,
  maxOutputBytes: 64,
  memoryLimitBytes: 256 * 1024 * 1024,
  stackLimitBytes: 128 * 1024 * 1024,
  processLimit: 8,
} as const;

interface GomokuRunResult {
  verdict: EvaluationVerdict;
  stdout: string;
  sandboxResult: JudgeResult;
  totalCpuNs: number;
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
    if (evaluation.language !== "CPP" || evaluation.sourceCode === null) {
      throw new Error("evaluation does not reference C++ source code");
    }
    if (evaluation.gameSlug !== "gomoku") {
      throw new Error(`unsupported game: ${evaluation.gameSlug}`);
    }
    const opponent = resolveBuiltinPlayer(
      evaluation.gameSlug,
      evaluation.opponent.implementationKey,
    );

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
      await this.repository.markRunning(
        evaluationId,
        compilation.result.status,
        compileLog,
      );
      const session = await this.judge.startInteractive(
        executableFileId,
        GOMOKU_LIMITS,
      );
      const run = await runGomokuEvaluation(
        session,
        opponent,
        seededRandom(evaluationId),
      );
      const sandbox = run.sandboxResult;
      await this.repository.finish(evaluationId, {
        verdict: run.verdict,
        compileStatus: compilation.result.status,
        compileLog,
        runStatus: sandbox.status,
        stdout: run.stdout,
        stderr: sandbox.files?.stderr ?? "",
        cpuTimeNs: BigInt(Math.max(sandbox.time, run.totalCpuNs)),
        wallTimeNs: BigInt(sandbox.runTime),
        memoryBytes: BigInt(sandbox.memory),
        ...(run.errorMessage === undefined
          ? {}
          : { errorMessage: run.errorMessage }),
      });
    } finally {
      await this.judge.deleteFile(executableFileId).catch(() => undefined);
    }
  }
}

export async function runGomokuEvaluation(
  session: InteractiveJudgeSession,
  opponent: GomokuBuiltinPlayerImplementation,
  random: () => number = Math.random,
  userSeat: GomokuSeat = 1,
): Promise<GomokuRunResult> {
  const game = new GomokuGame();
  const opponentPlayer = opponent.create({ random });
  const platformSeat: GomokuSeat = userSeat === 0 ? 1 : 0;
  const outputs: string[] = [];
  let totalCpuNs = 0;
  let verdict: EvaluationVerdict = "ACCEPTED";
  let failureMessage: string | undefined;
  let sandboxResult!: JudgeResult;

  let input = createGomokuInitialization(userSeat);
  if (platformSeat === 0) {
    const opening = opponentPlayer.chooseMove(game, platformSeat);
    game.play(platformSeat, opening);
    input += formatGomokuMove(opening);
  }

  try {
    while (game.result.type === "playing") {
      let turn: JudgeTurnResult;
      try {
        turn = await session.playTurn(input);
      } catch (error) {
        if (!(error instanceof JudgePlayerOutputError)) {
          throw error;
        }
        verdict = "INVALID_MOVE";
        failureMessage = error.message;
        break;
      }
      totalCpuNs = Math.max(totalCpuNs, turn.totalCpu);
      if (turn.type !== "turnCompleted") {
        ({ verdict, errorMessage: failureMessage } = verdictForTurn(turn));
        break;
      }

      const output = turn.output ?? "";
      outputs.push(output);
      try {
        game.play(userSeat, parseGomokuMove(output, game.height, game.width));
      } catch (error) {
        verdict = "INVALID_MOVE";
        failureMessage = errorMessage(error);
        break;
      }
      if (game.result.type !== "playing") {
        break;
      }

      const platformMove = opponentPlayer.chooseMove(game, platformSeat);
      game.play(platformSeat, platformMove);
      if (game.result.type !== "playing") {
        break;
      }
      input = formatGomokuMove(platformMove);
    }
  } finally {
    sandboxResult = await session.finish();
  }
  const sandboxFailure = verdictForSandboxFailure(sandboxResult.status);
  if (sandboxFailure !== undefined) {
    verdict = sandboxFailure;
    failureMessage ??= `sandbox finished with status: ${sandboxResult.status}`;
  }
  return {
    verdict,
    stdout: outputs.join(""),
    sandboxResult,
    totalCpuNs,
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

function verdictForTurn(turn: JudgeTurnResult): {
  verdict: EvaluationVerdict;
  errorMessage: string;
} {
  switch (turn.type) {
    case "moveCpuLimitExceeded":
      return {
        verdict: "TIME_LIMIT_EXCEEDED",
        errorMessage: "single-turn CPU time exceeded 100ms",
      };
    case "totalCpuLimitExceeded":
      return {
        verdict: "TIME_LIMIT_EXCEEDED",
        errorMessage: "total CPU time exceeded 5s",
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

function seededRandom(seed: string): () => number {
  let state = 0x811c9dc5;
  for (const character of seed) {
    state ^= character.codePointAt(0)!;
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
