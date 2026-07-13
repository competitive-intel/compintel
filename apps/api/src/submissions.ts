import { createHash } from "node:crypto";

import {
  PLAYER_EVALUATION_JOB,
  type CreatePlayerInput,
  type CreatePlayerVersionInput,
  type PlayerEvaluationJob,
  type SubmissionAccepted,
} from "@compintel/contracts";
import { Prisma, type PrismaClient } from "@compintel/db";

import { HttpError } from "./errors.js";

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

const EVALUATION_OPPONENTS: Readonly<Record<string, string>> = {
  gomoku: "gomoku:block-four-random:v1",
};

export class SubmissionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly queue: EvaluationQueue,
  ) {}

  async createPlayer(
    externalUserId: string,
    gameSlug: string,
    input: CreatePlayerInput,
  ): Promise<SubmissionAccepted> {
    let submission;
    try {
      submission = await this.db.$transaction(async (tx) => {
        const game = await tx.game.findUnique({ where: { slug: gameSlug } });
        if (game === null) {
          throw new HttpError(404, "game not found", "GAME_NOT_FOUND");
        }

        const user = await tx.user.upsert({
          where: { externalId: externalUserId },
          update: {},
          create: { externalId: externalUserId },
        });
        const player = await tx.player.create({
          data: {
            gameId: game.id,
            ownerId: user.id,
            kind: "USER",
            name: input.name,
          },
        });
        const playerVersion = await tx.playerVersion.create({
          data: {
            playerId: player.id,
            version: 1,
            language: "CPP",
            sourceCode: input.sourceCode,
            sourceSha256: sha256(input.sourceCode),
          },
        });
        const opponentVersionId = await findEvaluationOpponent(
          tx,
          game.id,
          game.slug,
        );
        const evaluation = await tx.evaluation.create({
          data: {
            playerVersionId: playerVersion.id,
            opponentVersionId,
          },
        });
        return { player, playerVersion, evaluation };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new HttpError(
          409,
          "a player with this name already exists in the game",
          "PLAYER_NAME_CONFLICT",
        );
      }
      throw error;
    }

    await this.enqueueOrFail(submission.evaluation.id);
    return {
      playerId: submission.player.id,
      playerVersionId: submission.playerVersion.id,
      version: submission.playerVersion.version,
      evaluationId: submission.evaluation.id,
      evaluationStatus: "QUEUED",
    };
  }

  async createVersion(
    externalUserId: string,
    playerId: string,
    input: CreatePlayerVersionInput,
  ): Promise<SubmissionAccepted> {
    const submission = await this.db.$transaction(
      async (tx) => {
        const player = await tx.player.findFirst({
          where: { id: playerId, owner: { externalId: externalUserId } },
          include: {
            game: { select: { slug: true } },
            versions: {
              orderBy: { version: "desc" },
              take: 1,
              select: { version: true },
            },
          },
        });
        if (player === null) {
          throw new HttpError(404, "player not found", "PLAYER_NOT_FOUND");
        }

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
        const opponentVersionId = await findEvaluationOpponent(
          tx,
          player.gameId,
          player.game.slug,
        );
        const evaluation = await tx.evaluation.create({
          data: {
            playerVersionId: playerVersion.id,
            opponentVersionId,
          },
        });
        return { player, playerVersion, evaluation };
      },
      { isolationLevel: "Serializable" },
    );

    await this.enqueueOrFail(submission.evaluation.id);
    return {
      playerId: submission.player.id,
      playerVersionId: submission.playerVersion.id,
      version: submission.playerVersion.version,
      evaluationId: submission.evaluation.id,
      evaluationStatus: "QUEUED",
    };
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
      await this.db.evaluation.update({
        where: { id: evaluationId },
        data: {
          status: "FINISHED",
          verdict: "INTERNAL_ERROR",
          errorMessage: "failed to enqueue evaluation",
          finishedAt: new Date(),
        },
      });
      throw new HttpError(
        503,
        "evaluation queue is unavailable",
        "QUEUE_UNAVAILABLE",
      );
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function findEvaluationOpponent(
  tx: Prisma.TransactionClient,
  gameId: string,
  gameSlug: string,
): Promise<string> {
  const implementationKey = EVALUATION_OPPONENTS[gameSlug];
  if (implementationKey === undefined) {
    throw new HttpError(
      503,
      "game has no evaluation opponent",
      "EVALUATION_OPPONENT_UNAVAILABLE",
    );
  }
  const opponent = await tx.playerVersion.findFirst({
    where: {
      language: "BUILTIN",
      implementationKey,
      player: { gameId, kind: "PLATFORM" },
    },
    select: { id: true },
  });
  if (opponent === null) {
    throw new HttpError(
      503,
      "game evaluation opponent is not installed",
      "EVALUATION_OPPONENT_UNAVAILABLE",
    );
  }
  return opponent.id;
}
