import type { PrismaClient } from "@compintel/db";

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
        opponentVersion: true,
        playerVersion: {
          include: { player: { include: { game: true } } },
        },
      },
    });
    if (evaluation === null) {
      return null;
    }
    if (
      evaluation.opponentVersion === null ||
      evaluation.opponentVersion.language !== "BUILTIN" ||
      evaluation.opponentVersion.implementationKey === null
    ) {
      throw new Error(
        `evaluation ${evaluationId} does not reference a built-in opponent version`,
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
      language: evaluation.playerVersion.language,
      gameSlug: evaluation.playerVersion.player.game.slug,
      opponent: {
        playerVersionId: evaluation.opponentVersion.id,
        language: evaluation.opponentVersion.language,
        implementationKey: evaluation.opponentVersion.implementationKey,
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
    await this.db.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: "FINISHED",
        verdict: result.verdict,
        ...(result.compileStatus === undefined
          ? {}
          : { compileStatus: result.compileStatus }),
        ...(result.compileLog === undefined
          ? {}
          : { compileLog: result.compileLog }),
        ...(result.runStatus === undefined
          ? {}
          : { runStatus: result.runStatus }),
        ...(result.stdout === undefined ? {} : { stdout: result.stdout }),
        ...(result.stderr === undefined ? {} : { stderr: result.stderr }),
        ...(result.cpuTimeNs === undefined
          ? {}
          : { cpuTimeNs: result.cpuTimeNs }),
        ...(result.wallTimeNs === undefined
          ? {}
          : { wallTimeNs: result.wallTimeNs }),
        ...(result.memoryBytes === undefined
          ? {}
          : { memoryBytes: result.memoryBytes }),
        ...(result.errorMessage === undefined
          ? {}
          : { errorMessage: result.errorMessage }),
        finishedAt: new Date(),
      },
    });
  }
}
