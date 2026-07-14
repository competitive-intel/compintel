import {
  adminGameListSchema,
  adminGameSchema,
  adminBuiltinPlayerListSchema,
  adminBuiltinPlayerSchema,
  adminUserSchema,
  adminUsersResponseSchema,
  authResponseSchema,
  createBuiltinPlayerSchema,
  createBuiltinPlayerVersionSchema,
  createPlayerSchema,
  gameDetailSchema,
  gameListSchema,
  loginSchema,
  playerNameListSchema,
  registerResponseSchema,
  registerSchema,
  reviewUserSchema,
  updateGameSchema,
  updateBuiltinPlayerSchema,
  type CurrentUser,
} from "@compintel/contracts";
import type { PrismaClient } from "@compintel/db";
import Fastify, { type FastifyInstance } from "fastify";
import { z, ZodError } from "zod";

import { AuthService } from "./auth.js";
import { BuiltinPlayerService } from "./builtin-players.js";
import { EvaluationRecordService } from "./evaluation-records.js";
import { HttpError } from "./errors.js";
import { GameService } from "./games.js";
import { SubmissionService } from "./submissions.js";

const gameParamsSchema = z.object({ gameSlug: z.string().min(1).max(64) });
const submissionParamsSchema = z.object({ submissionId: z.string().min(1) });
const submissionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const userParamsSchema = z.object({ userId: z.string().min(1) });
const gameIdParamsSchema = z.object({ gameId: z.string().min(1) });
const builtinPlayerParamsSchema = z.object({
  builtinPlayerId: z.string().min(1),
});
const SESSION_COOKIE_NAME = "compintel_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface AppDependencies {
  db: PrismaClient;
  submissions: SubmissionService;
  auth?: AuthService;
  games?: GameService;
  builtinPlayers?: BuiltinPlayerService;
  evaluationRecords?: EvaluationRecordService;
  secureCookies?: boolean;
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: true });
  const auth = dependencies.auth ?? new AuthService(dependencies.db);
  const games = dependencies.games ?? new GameService(dependencies.db);
  const builtinPlayers =
    dependencies.builtinPlayers ?? new BuiltinPlayerService(dependencies.db);
  const evaluationRecords =
    dependencies.evaluationRecords ??
    new EvaluationRecordService(dependencies.db);
  const secureCookies = dependencies.secureCookies ?? false;

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/v1/auth/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await auth.register(input);
    return reply.code(201).send(registerResponseSchema.parse({ user }));
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const session = await auth.login(input);
    reply.header(
      "set-cookie",
      sessionCookie(session.token, SESSION_MAX_AGE_SECONDS, secureCookies),
    );
    return authResponseSchema.parse({ user: session.user });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    await auth.logout(readSessionToken(request.headers.cookie));
    reply.header("set-cookie", sessionCookie("", 0, secureCookies));
    return reply.code(204).send();
  });

  app.get("/v1/auth/me", async (request) => {
    const user = await requireUser(auth, request.headers.cookie);
    return authResponseSchema.parse({ user });
  });

  app.get("/v1/admin/users", async (request) => {
    await requireAdministrator(auth, request.headers.cookie);
    return adminUsersResponseSchema.parse({ users: await auth.listUsers() });
  });

  app.post("/v1/admin/users/:userId/review", async (request) => {
    const administrator = await requireAdministrator(
      auth,
      request.headers.cookie,
    );
    const { userId } = userParamsSchema.parse(request.params);
    const input = reviewUserSchema.parse(request.body);
    return adminUserSchema.parse(
      await auth.reviewUser(administrator.id, userId, input),
    );
  });

  app.get("/v1/games", async (request) => {
    await requireUser(auth, request.headers.cookie);
    return gameListSchema.parse({ games: await games.listPublished() });
  });

  app.get("/v1/games/:gameSlug", async (request) => {
    await requireUser(auth, request.headers.cookie);
    const { gameSlug } = gameParamsSchema.parse(request.params);
    return gameDetailSchema.parse(await games.getPublished(gameSlug));
  });

  app.get("/v1/admin/games", async (request) => {
    await requireAdministrator(auth, request.headers.cookie);
    return adminGameListSchema.parse({ games: await games.listAll() });
  });

  app.patch("/v1/admin/games/:gameId", async (request) => {
    await requireAdministrator(auth, request.headers.cookie);
    const { gameId } = gameIdParamsSchema.parse(request.params);
    const input = updateGameSchema.parse(request.body);
    return adminGameSchema.parse(await games.update(gameId, input));
  });

  app.get("/v1/admin/games/:gameId/builtin-players", async (request) => {
    await requireAdministrator(auth, request.headers.cookie);
    const { gameId } = gameIdParamsSchema.parse(request.params);
    return adminBuiltinPlayerListSchema.parse({
      players: await builtinPlayers.list(gameId),
    });
  });

  app.post(
    "/v1/admin/games/:gameId/builtin-players",
    async (request, reply) => {
      await requireAdministrator(auth, request.headers.cookie);
      const { gameId } = gameIdParamsSchema.parse(request.params);
      const input = createBuiltinPlayerSchema.parse(request.body);
      return reply
        .code(201)
        .send(
          adminBuiltinPlayerSchema.parse(
            await builtinPlayers.create(gameId, input),
          ),
        );
    },
  );

  app.patch("/v1/admin/builtin-players/:builtinPlayerId", async (request) => {
    await requireAdministrator(auth, request.headers.cookie);
    const { builtinPlayerId } = builtinPlayerParamsSchema.parse(request.params);
    const input = updateBuiltinPlayerSchema.parse(request.body);
    return adminBuiltinPlayerSchema.parse(
      await builtinPlayers.update(builtinPlayerId, input),
    );
  });

  app.post(
    "/v1/admin/builtin-players/:builtinPlayerId/versions",
    async (request, reply) => {
      await requireAdministrator(auth, request.headers.cookie);
      const { builtinPlayerId } = builtinPlayerParamsSchema.parse(
        request.params,
      );
      const input = createBuiltinPlayerVersionSchema.parse(request.body);
      return reply
        .code(201)
        .send(
          adminBuiltinPlayerSchema.parse(
            await builtinPlayers.createVersion(builtinPlayerId, input),
          ),
        );
    },
  );

  app.post("/v1/games/:gameSlug/players", async (request, reply) => {
    const user = await requireUser(auth, request.headers.cookie);
    const { gameSlug } = gameParamsSchema.parse(request.params);
    const input = createPlayerSchema.parse(request.body);
    const result = await dependencies.submissions.createPlayer(
      user.id,
      gameSlug,
      input,
    );
    return reply.code(202).send(result);
  });

  app.get("/v1/games/:gameSlug/players", async (request) => {
    const user = await requireUser(auth, request.headers.cookie);
    const { gameSlug } = gameParamsSchema.parse(request.params);
    return playerNameListSchema.parse({
      names: await dependencies.submissions.listPlayerNames(user.id, gameSlug),
    });
  });

  app.get("/v1/games/:gameSlug/submissions", async (request) => {
    await requireUser(auth, request.headers.cookie);
    const { gameSlug } = gameParamsSchema.parse(request.params);
    const input = submissionListQuerySchema.parse(request.query);
    return evaluationRecords.listForGame(gameSlug, input);
  });

  app.get("/v1/submissions/:submissionId", async (request) => {
    await requireUser(auth, request.headers.cookie);
    const { submissionId } = submissionParamsSchema.parse(request.params);
    return evaluationRecords.getDetail(submissionId);
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

async function requireUser(
  auth: AuthService,
  cookieHeader: string | undefined,
): Promise<CurrentUser> {
  const user = await auth.authenticate(readSessionToken(cookieHeader));
  if (user === null) {
    throw new HttpError(401, "请先登录", "AUTH_REQUIRED");
  }
  return user;
}

async function requireAdministrator(
  auth: AuthService,
  cookieHeader: string | undefined,
): Promise<CurrentUser> {
  const user = await requireUser(auth, cookieHeader);
  if (user.role !== "ADMIN") {
    throw new HttpError(403, "需要管理员权限", "ADMIN_REQUIRED");
  }
  return user;
}

function readSessionToken(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === SESSION_COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
