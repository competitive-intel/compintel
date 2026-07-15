import { createHash } from "node:crypto";

import {
  PLAYER_EVALUATION_JOB,
  type CreatePlayerInput,
  type PlayerEvaluationJob,
  type SubmissionAccepted,
} from "@compintel/contracts";
import {
  Prisma,
  type PrismaClient,
  updateEvaluationAndScore,
} from "@compintel/db";

import { HttpError } from "./errors.js";

const SUBMISSION_RATE_LIMIT = 50;
const SUBMISSION_RATE_WINDOW_MS = 24 * 60 * 60 * 1_000;

interface EvaluationQueue {
  add(
    name: string,
    data: PlayerEvaluationJob,
    options: {
      jobId: string;
      attempts: number;
      backoff: { type: "exponential"; delay: number };
      removeOnComplete: number;
      removeOnFail: number;
    },
  ): Promise<unknown>;
}

export class SubmissionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly queue: EvaluationQueue,
  ) {}

  async createPlayer(
    userId: string,
    gameSlug: string,
    input: CreatePlayerInput,
  ): Promise<SubmissionAccepted> {
    const submission = await retryVersionConflict(() =>
      this.db.$transaction(
        async (tx) => {
          const game = await tx.game.findFirst({
            where: { slug: gameSlug, isPublished: true },
          });
          if (game === null) {
            throw new HttpError(404, "游戏不存在或尚未发布", "GAME_NOT_FOUND");
          }

          const windowStart = new Date(Date.now() - SUBMISSION_RATE_WINDOW_MS);
          const recentSubmissionCount = await tx.playerVersion.count({
            where: {
              createdAt: { gte: windowStart },
              player: {
                ownerId: userId,
                gameId: game.id,
                kind: "USER",
              },
            },
          });
          if (recentSubmissionCount >= SUBMISSION_RATE_LIMIT) {
            throw new HttpError(
              429,
              `提交过于频繁，每个游戏每 24 小时最多提交 ${SUBMISSION_RATE_LIMIT} 次`,
              "SUBMISSION_RATE_LIMIT",
            );
          }

          const player = await tx.player.upsert({
            where: {
              gameId_ownerId_name: {
                gameId: game.id,
                ownerId: userId,
                name: input.name,
              },
            },
            update: {},
            create: {
              gameId: game.id,
              ownerId: userId,
              kind: "USER",
              name: input.name,
            },
            include: {
              versions: {
                orderBy: { version: "desc" },
                take: 1,
                select: { version: true },
              },
            },
          });
          const nextVersion = (player.versions[0]?.version ?? 0) + 1;
          const playerVersion = await tx.playerVersion.create({
            data: {
              playerId: player.id,
              version: nextVersion,
              language: "CPP",
              sourceCode: input.sourceCode,
              sourceSha256: sha256(input.sourceCode),
            },
          });
          const opponents = await findEvaluationOpponents(tx, game.id);
          const evaluations = await Promise.all(
            opponents.map((opponent) =>
              tx.evaluation.create({
                data: {
                  playerVersionId: playerVersion.id,
                  opponentVersionId: opponent.versionId,
                  opponentWeight: opponent.weight,
                },
              }),
            ),
          );
          return { player, playerVersion, evaluations };
        },
        { isolationLevel: "Serializable" },
      ),
    );

    await Promise.all(
      submission.evaluations.map((evaluation) =>
        this.enqueueOrFail(evaluation.id),
      ),
    );
    return {
      playerId: submission.player.id,
      playerVersionId: submission.playerVersion.id,
      version: submission.playerVersion.version,
      evaluationIds: submission.evaluations.map((evaluation) => evaluation.id),
      evaluationStatus: "QUEUED",
    };
  }

  async listPlayerNames(userId: string, gameSlug: string): Promise<string[]> {
    const game = await this.db.game.findFirst({
      where: { slug: gameSlug, isPublished: true },
      select: { id: true },
    });
    if (game === null) {
      throw new HttpError(404, "游戏不存在或尚未发布", "GAME_NOT_FOUND");
    }
    const players = await this.db.player.findMany({
      where: { gameId: game.id, ownerId: userId, kind: "USER" },
      orderBy: { name: "asc" },
      select: { name: true },
    });
    return players.map((player) => player.name);
  }

  private async enqueueOrFail(evaluationId: string): Promise<void> {
    try {
      await this.queue.add(
        PLAYER_EVALUATION_JOB,
        { evaluationId },
        {
          jobId: evaluationId,
          attempts: 3,
          backoff: { type: "exponential", delay: 1_000 },
          removeOnComplete: 500,
          removeOnFail: 1_000,
        },
      );
    } catch (error) {
      await updateEvaluationAndScore(this.db, evaluationId, {
        status: "FINISHED",
        verdict: "INTERNAL_ERROR",
        errorMessage: "failed to enqueue evaluation",
        finishedAt: new Date(),
      });
      throw new HttpError(
        503,
        "evaluation queue is unavailable",
        "QUEUE_UNAVAILABLE",
      );
    }
  }
}

async function retryVersionConflict<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034");
      if (!isRetryable || attempt >= 3) throw error;
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function findEvaluationOpponents(
  tx: Prisma.TransactionClient,
  gameId: string,
): Promise<Array<{ versionId: string; weight: number }>> {
  const opponents = await tx.player.findMany({
    where: {
      gameId,
      kind: "PLATFORM",
      isActive: true,
      versions: { some: { language: "CPP" } },
    },
    orderBy: { name: "asc" },
    select: {
      weight: true,
      versions: {
        where: { language: "CPP" },
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  const evaluationOpponents = opponents.flatMap((opponent) =>
    opponent.versions.map((version) => ({
      versionId: version.id,
      weight: opponent.weight,
    })),
  );
  if (evaluationOpponents.length === 0) {
    throw new HttpError(
      503,
      "game has no installed evaluation opponents",
      "EVALUATION_OPPONENT_UNAVAILABLE",
    );
  }
  return evaluationOpponents;
}
