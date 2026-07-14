import type { GameReplay, GameResourceLimits } from "@compintel/contracts";
import type {
  InteractiveJudgeSession,
  JudgeClient,
} from "@compintel/judge-client";

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
  ) {}

  async process(evaluationId: string): Promise<void> {
    const evaluation = await this.repository.start(evaluationId);
    if (evaluation === null) {
      throw new Error(`evaluation ${evaluationId} does not exist`);
    }
    if (evaluation.status === "FINISHED") {
      return;
    }
    const game = getEvaluationGame(evaluation.gameSlug);
    if (game === undefined) {
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
          game.staticLimits,
        );
        await this.repository.markRunning(
          evaluationId,
          compilation.result.status,
          compileLog,
        );
        const run = await game.runEvaluation(
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
