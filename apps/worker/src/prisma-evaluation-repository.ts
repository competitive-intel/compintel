import {
  Prisma,
  type PrismaClient,
  updateEvaluationAndScore,
} from "@compintel/db";

import type {
  EvaluationRepository,
  EvaluationSource,
  FinishEvaluationInput,
} from "./evaluation-processor.js";

export class PrismaEvaluationRepository implements EvaluationRepository {
  constructor(private readonly db: PrismaClient) {}

  async start(evaluationId: string): Promise<EvaluationSource | null> {
    const evaluation = await this.db.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        opponentVersion: {
          include: { player: { select: { kind: true } } },
        },
        playerVersion: {
          include: { player: { include: { game: true } } },
        },
      },
    });
    if (evaluation === null) {
      return null;
    }
    if (evaluation.opponentVersion.player.kind !== "PLATFORM") {
      throw new Error(
        `evaluation ${evaluationId} does not reference a C++ platform opponent version`,
      );
    }
    if (evaluation.status !== "FINISHED") {
      await this.db.evaluation.update({
        where: { id: evaluationId },
        data: {
          status: "COMPILING",
          attempts: { increment: 1 },
          startedAt: evaluation.startedAt ?? new Date(),
          errorMessage: null,
        },
      });
    }
    return {
      status: evaluation.status,
      sourceCode: evaluation.playerVersion.sourceCode,
      gameSlug: evaluation.playerVersion.player.game.slug,
      resourceLimits: {
        moveCpuLimitMs: evaluation.playerVersion.player.game.moveCpuLimitMs,
        totalCpuLimitMs: evaluation.playerVersion.player.game.totalCpuLimitMs,
        memoryLimitMiB: evaluation.playerVersion.player.game.memoryLimitMiB,
      },
      opponent: {
        sourceCode: evaluation.opponentVersion.sourceCode,
      },
    };
  }

  async markRunning(
    evaluationId: string,
    compileStatus: string,
    compileLog: string,
  ): Promise<void> {
    await this.db.evaluation.update({
      where: { id: evaluationId },
      data: { status: "RUNNING", compileStatus, compileLog },
    });
  }

  async finish(
    evaluationId: string,
    result: FinishEvaluationInput,
  ): Promise<void> {
    await updateEvaluationAndScore(this.db, evaluationId, {
      status: "FINISHED",
      verdict: result.verdict,
      ...(result.compileStatus === undefined
        ? {}
        : { compileStatus: result.compileStatus }),
      ...(result.compileLog === undefined
        ? {}
        : { compileLog: result.compileLog }),
      ...(result.opponentCompileStatus === undefined
        ? {}
        : { opponentCompileStatus: result.opponentCompileStatus }),
      ...(result.opponentCompileLog === undefined
        ? {}
        : { opponentCompileLog: result.opponentCompileLog }),
      ...(result.runStatus === undefined
        ? {}
        : { runStatus: result.runStatus }),
      ...(result.opponentRunStatus === undefined
        ? {}
        : { opponentRunStatus: result.opponentRunStatus }),
      ...(result.stdout === undefined ? {} : { stdout: result.stdout }),
      ...(result.stderr === undefined ? {} : { stderr: result.stderr }),
      ...(result.opponentStderr === undefined
        ? {}
        : { opponentStderr: result.opponentStderr }),
      ...(result.cpuTimeNs === undefined
        ? {}
        : { cpuTimeNs: result.cpuTimeNs }),
      ...(result.wallTimeNs === undefined
        ? {}
        : { wallTimeNs: result.wallTimeNs }),
      ...(result.memoryBytes === undefined
        ? {}
        : { memoryBytes: result.memoryBytes }),
      ...(result.opponentCpuTimeNs === undefined
        ? {}
        : { opponentCpuTimeNs: result.opponentCpuTimeNs }),
      ...(result.opponentWallTimeNs === undefined
        ? {}
        : { opponentWallTimeNs: result.opponentWallTimeNs }),
      ...(result.opponentMemoryBytes === undefined
        ? {}
        : { opponentMemoryBytes: result.opponentMemoryBytes }),
      ...(result.errorMessage === undefined
        ? {}
        : { errorMessage: result.errorMessage }),
      ...(result.replay === undefined
        ? {}
        : {
            replay: result.replay as Prisma.InputJsonValue,
            won:
              result.verdict === "ACCEPTED" &&
              result.replay.result.type === "win" &&
              result.replay.result.winner === result.replay.userSeat,
          }),
      finishedAt: new Date(),
    });
  }
}
