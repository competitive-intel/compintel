import { performance } from "node:perf_hooks";

import type { GameReplay, GameResourceLimits } from "@compintel/contracts";
import type {
  InteractiveJudgeSession,
  JudgeClient,
  JudgeResult,
} from "@compintel/judge-client";
import type { Logger } from "@compintel/logger";

import {
  getEvaluationGame,
  type InteractiveStaticLimits,
} from "./games/index.js";
import type { EvaluationVerdict } from "./games/interactive.js";

export type { EvaluationVerdict };

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

export class EvaluationProcessor {
  constructor(
    private readonly repository: EvaluationRepository,
    private readonly judge: JudgeClient,
    private readonly logger?: Logger,
  ) {}

  async process(evaluationId: string): Promise<void> {
    const processingStartedAt = performance.now();
    const logger = this.logger?.child({ evaluationId });
    logger?.info(
      { event: "evaluation.processing_started" },
      "evaluation processing started",
    );

    try {
      await this.processEvaluation(evaluationId, logger, processingStartedAt);
      logger?.debug(
        {
          event: "evaluation.processing_completed",
          durationMs: elapsedMilliseconds(processingStartedAt),
        },
        "evaluation processing completed",
      );
    } catch (error) {
      logger?.error(
        {
          err: error,
          event: "evaluation.processing_failed",
          durationMs: elapsedMilliseconds(processingStartedAt),
        },
        "evaluation processing failed",
      );
      throw error;
    }
  }

  private async processEvaluation(
    evaluationId: string,
    logger: Logger | undefined,
    processingStartedAt: number,
  ): Promise<void> {
    const loadStartedAt = performance.now();
    const evaluation = await this.repository.start(evaluationId);
    if (evaluation === null) {
      throw new Error(`evaluation ${evaluationId} does not exist`);
    }
    if (evaluation.status === "FINISHED") {
      logger?.info(
        { event: "evaluation.skipped", reason: "already_finished" },
        "evaluation already finished",
      );
      return;
    }
    logger?.info(
      {
        event: "evaluation.loaded",
        gameSlug: evaluation.gameSlug,
        resourceLimits: evaluation.resourceLimits,
        durationMs: elapsedMilliseconds(loadStartedAt),
      },
      "evaluation loaded",
    );
    const game = getEvaluationGame(evaluation.gameSlug);
    if (game === undefined) {
      throw new Error(`unsupported game: ${evaluation.gameSlug}`);
    }

    const playerCompilationStartedAt = performance.now();
    logger?.info(
      { event: "evaluation.compilation_started", side: "user" },
      "user compilation started",
    );
    const compilation = await this.judge.compileCpp(evaluation.sourceCode);
    const compileLog = compilation.result.files?.stderr ?? "";
    logger?.info(
      {
        event: "evaluation.compilation_completed",
        side: "user",
        status: compilation.result.status,
        artifactCreated: compilation.executableFileId !== null,
        durationMs: elapsedMilliseconds(playerCompilationStartedAt),
        ...sandboxMetrics(compilation.result),
      },
      "user compilation completed",
    );
    if (
      compilation.result.status !== "Accepted" ||
      compilation.executableFileId === null
    ) {
      const verdict =
        compilation.result.status === "Accepted"
          ? "INTERNAL_ERROR"
          : verdictForStatus(compilation.result.status, true);
      await this.repository.finish(evaluationId, {
        verdict,
        compileStatus: compilation.result.status,
        compileLog,
        errorMessage:
          compilation.executableFileId === null &&
          compilation.result.status === "Accepted"
            ? "go-judge did not return a compiled artifact"
            : compilation.result.error,
      });
      logger?.info(
        {
          event: "evaluation.finished",
          verdict,
          outcomeStage: "user_compilation",
          durationMs: elapsedMilliseconds(processingStartedAt),
        },
        "evaluation finished",
      );
      return;
    }

    const executableFileId = compilation.executableFileId;
    try {
      const opponentCompilationStartedAt = performance.now();
      logger?.info(
        { event: "evaluation.compilation_started", side: "platform" },
        "platform opponent compilation started",
      );
      const opponentCompilation = await this.judge.compileCpp(
        evaluation.opponent.sourceCode,
      );
      const opponentCompileLog = opponentCompilation.result.files?.stderr ?? "";
      logger?.info(
        {
          event: "evaluation.compilation_completed",
          side: "platform",
          status: opponentCompilation.result.status,
          artifactCreated: opponentCompilation.executableFileId !== null,
          durationMs: elapsedMilliseconds(opponentCompilationStartedAt),
          ...sandboxMetrics(opponentCompilation.result),
        },
        "platform opponent compilation completed",
      );
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
        logger?.error(
          {
            event: "evaluation.finished",
            verdict: "INTERNAL_ERROR",
            outcomeStage: "platform_compilation",
            opponentCompileStatus: opponentCompilation.result.status,
            durationMs: elapsedMilliseconds(processingStartedAt),
          },
          "evaluation failed because platform compilation failed",
        );
        return;
      }

      const opponentExecutableFileId = opponentCompilation.executableFileId;
      try {
        const sessionsStartedAt = performance.now();
        logger?.info(
          { event: "evaluation.sessions_starting" },
          "sandbox sessions starting",
        );
        const [playerSession, opponentSession] = await startBothSessions(
          this.judge,
          executableFileId,
          opponentExecutableFileId,
          evaluation.resourceLimits,
          game.staticLimits,
        );
        logger?.info(
          {
            event: "evaluation.sessions_started",
            durationMs: elapsedMilliseconds(sessionsStartedAt),
          },
          "sandbox sessions started",
        );
        await this.repository.markRunning(
          evaluationId,
          compilation.result.status,
          compileLog,
        );
        logger?.info(
          { event: "evaluation.running", gameSlug: evaluation.gameSlug },
          "evaluation running",
        );
        const matchStartedAt = performance.now();
        const run = await game.runEvaluation(
          playerSession,
          opponentSession,
          1,
          evaluation.resourceLimits,
          logger?.child({ phase: "game" }),
        );
        const playerSandbox = run.playerSandboxResult;
        const opponentSandbox = run.opponentSandboxResult;
        const playerCpuTimeNs = Math.max(
          playerSandbox.time,
          run.playerTotalCpuNs,
        );
        const opponentCpuTimeNs = Math.max(
          opponentSandbox.time,
          run.opponentTotalCpuNs,
        );
        const won =
          run.verdict === "ACCEPTED" &&
          run.replay.result.type === "win" &&
          run.replay.result.winner === run.replay.userSeat;
        logger?.info(
          {
            event: "evaluation.match_completed",
            verdict: run.verdict,
            won,
            moveCount: run.replay.moves.length,
            durationMs: elapsedMilliseconds(matchStartedAt),
            errorMessage: run.errorMessage,
            user: {
              status: playerSandbox.status,
              cpuTimeMs: nanosecondsToMilliseconds(playerCpuTimeNs),
              wallTimeMs: nanosecondsToMilliseconds(playerSandbox.runTime),
              memoryMiB: bytesToMebibytes(playerSandbox.memory),
            },
            platform: {
              status: opponentSandbox.status,
              cpuTimeMs: nanosecondsToMilliseconds(opponentCpuTimeNs),
              wallTimeMs: nanosecondsToMilliseconds(opponentSandbox.runTime),
              memoryMiB: bytesToMebibytes(opponentSandbox.memory),
            },
          },
          "evaluation match completed",
        );
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
          cpuTimeNs: BigInt(playerCpuTimeNs),
          wallTimeNs: BigInt(playerSandbox.runTime),
          memoryBytes: BigInt(playerSandbox.memory),
          opponentCpuTimeNs: BigInt(opponentCpuTimeNs),
          opponentWallTimeNs: BigInt(opponentSandbox.runTime),
          opponentMemoryBytes: BigInt(opponentSandbox.memory),
          replay: run.replay,
          ...(run.errorMessage === undefined
            ? {}
            : { errorMessage: run.errorMessage }),
        });
        logger?.info(
          {
            event: "evaluation.finished",
            verdict: run.verdict,
            won,
            durationMs: elapsedMilliseconds(processingStartedAt),
          },
          "evaluation result persisted",
        );
      } finally {
        await this.deleteArtifact(opponentExecutableFileId, "platform", logger);
      }
    } finally {
      await this.deleteArtifact(executableFileId, "user", logger);
    }
  }

  private async deleteArtifact(
    fileId: string,
    side: "user" | "platform",
    logger: Logger | undefined,
  ): Promise<void> {
    try {
      await this.judge.deleteFile(fileId);
      logger?.debug(
        { event: "evaluation.artifact_deleted", side },
        "compiled artifact deleted",
      );
    } catch (error) {
      logger?.warn(
        { err: error, event: "evaluation.artifact_delete_failed", side },
        "failed to delete compiled artifact",
      );
    }
  }
}

async function startBothSessions(
  judge: JudgeClient,
  playerExecutableFileId: string,
  opponentExecutableFileId: string,
  resourceLimits: GameResourceLimits,
  staticLimits: InteractiveStaticLimits,
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

function sandboxMetrics(result: JudgeResult): {
  cpuTimeMs: number;
  wallTimeMs: number;
  memoryMiB: number;
} {
  return {
    cpuTimeMs: nanosecondsToMilliseconds(result.time),
    wallTimeMs: nanosecondsToMilliseconds(result.runTime),
    memoryMiB: bytesToMebibytes(result.memory),
  };
}

function elapsedMilliseconds(startedAt: number): number {
  return roundToThreeDecimals(performance.now() - startedAt);
}

function nanosecondsToMilliseconds(value: number): number {
  return roundToThreeDecimals(value / 1_000_000);
}

function bytesToMebibytes(value: number): number {
  return roundToThreeDecimals(value / (1024 * 1024));
}

function roundToThreeDecimals(value: number): number {
  return Math.round(value * 1_000) / 1_000;
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
