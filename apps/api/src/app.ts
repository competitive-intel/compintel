import {
  createPlayerSchema,
  createPlayerVersionSchema,
  type Evaluation,
} from "@compintel/contracts";
import type { PrismaClient } from "@compintel/db";
import Fastify, { type FastifyInstance } from "fastify";
import { z, ZodError } from "zod";

import { HttpError } from "./errors.js";
import { SubmissionService } from "./submissions.js";

const gameParamsSchema = z.object({ gameSlug: z.string().min(1).max(64) });
const playerParamsSchema = z.object({ playerId: z.string().min(1) });
const evaluationParamsSchema = z.object({ evaluationId: z.string().min(1) });
const userIdSchema = z.string().trim().min(1).max(128);

export interface AppDependencies {
  db: PrismaClient;
  submissions: SubmissionService;
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/v1/games", async () => {
    const games = await dependencies.db.game.findMany({
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, rulesVersion: true },
    });
    return { games };
  });

  app.post("/v1/games/:gameSlug/players", async (request, reply) => {
    const userId = readUserId(request.headers["x-user-id"]);
    const { gameSlug } = gameParamsSchema.parse(request.params);
    const input = createPlayerSchema.parse(request.body);
    const result = await dependencies.submissions.createPlayer(
      userId,
      gameSlug,
      input,
    );
    return reply.code(202).send(result);
  });

  app.post("/v1/players/:playerId/versions", async (request, reply) => {
    const userId = readUserId(request.headers["x-user-id"]);
    const { playerId } = playerParamsSchema.parse(request.params);
    const input = createPlayerVersionSchema.parse(request.body);
    const result = await dependencies.submissions.createVersion(
      userId,
      playerId,
      input,
    );
    return reply.code(202).send(result);
  });

  app.get("/v1/evaluations/:evaluationId", async (request) => {
    const userId = readUserId(request.headers["x-user-id"]);
    const { evaluationId } = evaluationParamsSchema.parse(request.params);
    const evaluation = await dependencies.db.evaluation.findFirst({
      where: {
        id: evaluationId,
        playerVersion: { player: { owner: { externalId: userId } } },
      },
    });
    if (evaluation === null) {
      throw new HttpError(404, "evaluation not found", "EVALUATION_NOT_FOUND");
    }
    return serializeEvaluation(evaluation);
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "request validation failed",
        issues: error.issues,
      });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "an internal error occurred",
    });
  });

  return app;
}

function readUserId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    throw new HttpError(400, "x-user-id must occur once", "INVALID_USER_ID");
  }
  if (value === undefined) {
    throw new HttpError(401, "x-user-id is required", "AUTH_REQUIRED");
  }
  return userIdSchema.parse(value);
}

function serializeEvaluation(evaluation: {
  id: string;
  playerVersionId: string;
  opponentVersionId: string | null;
  status: Evaluation["status"];
  verdict: Evaluation["verdict"];
  compileStatus: string | null;
  compileLog: string | null;
  runStatus: string | null;
  stdout: string | null;
  stderr: string | null;
  cpuTimeNs: bigint | null;
  wallTimeNs: bigint | null;
  memoryBytes: bigint | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): Evaluation {
  return {
    ...evaluation,
    cpuTimeNs: evaluation.cpuTimeNs?.toString() ?? null,
    wallTimeNs: evaluation.wallTimeNs?.toString() ?? null,
    memoryBytes: evaluation.memoryBytes?.toString() ?? null,
    createdAt: evaluation.createdAt.toISOString(),
    startedAt: evaluation.startedAt?.toISOString() ?? null,
    finishedAt: evaluation.finishedAt?.toISOString() ?? null,
  };
}
