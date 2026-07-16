import { randomUUID } from "node:crypto";

import {
  adminGameListSchema,
  adminGameSchema,
  adminBuiltinPlayerListSchema,
  adminBuiltinPlayerSchema,
  adminUserSchema,
  adminUsersResponseSchema,
  authResponseSchema,
  captchaConfigSchema,
  createBuiltinPlayerSchema,
  createBuiltinPlayerVersionSchema,
  createPlayerSchema,
  evaluationWorkerStatusSchema,
  gameDetailSchema,
  gameListSchema,
  loginSchema,
  okResponseSchema,
  playerNameListSchema,
  registerResponseSchema,
  registerSchema,
  resendVerificationSchema,
  systemSettingsSchema,
  updateGameSchema,
  updateBuiltinPlayerSchema,
  updateSystemSettingsSchema,
  verifyEmailResponseSchema,
  verifyEmailSchema,
  type CurrentUser,
} from "@compintel/contracts";
import type { PrismaClient } from "@compintel/db";
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  LogController,
} from "fastify";
import { z, ZodError } from "zod";

import { AuthService } from "./auth.js";
import { BuiltinPlayerService } from "./builtin-players.js";
import { resolveClientIp } from "./client-ip.js";
import { EvaluationRecordService } from "./evaluation-records.js";
import { EvaluationWorkerStatusService } from "./evaluation-worker-status.js";
import { HttpError } from "./errors.js";
import { GameService } from "./games.js";
import { SubmissionService } from "./submissions.js";
import { SystemSettingsService } from "./system-settings.js";

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
  workerStatus: EvaluationWorkerStatusService;
  auth?: AuthService;
  games?: GameService;
  builtinPlayers?: BuiltinPlayerService;
  evaluationRecords?: EvaluationRecordService;
  systemSettings?: SystemSettingsService;
  secureCookies?: boolean;
  logger?: FastifyBaseLogger;
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const requestOptions = {
    requestIdHeader: "x-request-id",
    logController: new LogController({ requestIdLogLabel: "requestId" }),
    genReqId: () => randomUUID(),
  } as const;
  const app =
    dependencies.logger === undefined
      ? Fastify({ ...requestOptions, logger: false })
      : Fastify({ ...requestOptions, loggerInstance: dependencies.logger });
  const auth = dependencies.auth ?? new AuthService(dependencies.db);
  const games = dependencies.games ?? new GameService(dependencies.db);
  const builtinPlayers =
    dependencies.builtinPlayers ?? new BuiltinPlayerService(dependencies.db);
  const evaluationRecords =
    dependencies.evaluationRecords ??
    new EvaluationRecordService(dependencies.db);
  const systemSettings =
    dependencies.systemSettings ?? new SystemSettingsService(dependencies.db);
  const workerStatus = dependencies.workerStatus;
  const secureCookies = dependencies.secureCookies ?? false;

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/v1/auth/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await auth.register(input, {
      clientIp: resolveClientIp(request.headers, request.ip),
    });
    request.log.info(
      { event: "auth.user_registered", userId: user.id },
      "user registered",
    );
    return reply.code(201).send(registerResponseSchema.parse({ user }));
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const session = await auth.login(input);
    reply.header(
      "set-cookie",
      sessionCookie(session.token, SESSION_MAX_AGE_SECONDS, secureCookies),
    );
    request.log.info(
      { event: "auth.user_logged_in", userId: session.user.id },
      "user logged in",
    );
    return authResponseSchema.parse({ user: session.user });
  });

  app.post("/v1/auth/verify-email", async (request) => {
    const input = verifyEmailSchema.parse(request.body);
    const result = await auth.verifyEmail(input);
    if ("user" in result) {
      request.log.info(
        { event: "auth.email_verified", userId: result.user.id },
        "email verified",
      );
    }
    return verifyEmailResponseSchema.parse(result);
  });

  app.post("/v1/auth/resend-verification", async (request) => {
    const input = resendVerificationSchema.parse(request.body);
    await auth.resendVerification(input, {
      clientIp: resolveClientIp(request.headers, request.ip),
    });
    request.log.info(
      { event: "auth.verification_resent" },
      "verification email resent",
    );
    return okResponseSchema.parse({ ok: true });
  });

  app.get("/v1/auth/captcha-config", async () => {
    return captchaConfigSchema.parse(await systemSettings.getCaptchaConfig());
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

  app.get("/v1/admin/system-settings", async (request) => {
    await requireAdministrator(auth, request.headers.cookie);
    return systemSettingsSchema.parse(await systemSettings.get());
  });

  app.get("/v1/admin/evaluation-worker-status", async (request) => {
    await requireAdministrator(auth, request.headers.cookie);
    return evaluationWorkerStatusSchema.parse(await workerStatus.get());
  });

  app.patch("/v1/admin/system-settings", async (request) => {
    const administrator = await requireAdministrator(
      auth,
      request.headers.cookie,
    );
    const input = updateSystemSettingsSchema.parse(request.body);
    const settings = await systemSettings.update(administrator.id, input);
    request.log.info(
      {
        event: "admin.system_settings_updated",
        administratorId: administrator.id,
      },
      "system settings updated",
    );
    return systemSettingsSchema.parse(settings);
  });

  app.get("/v1/admin/users", async (request) => {
    await requireAdministrator(auth, request.headers.cookie);
    return adminUsersResponseSchema.parse({ users: await auth.listUsers() });
  });

  app.post("/v1/admin/users/:userId/ban", async (request) => {
    const administrator = await requireAdministrator(
      auth,
      request.headers.cookie,
    );
    const { userId } = userParamsSchema.parse(request.params);
    const user = await auth.banUser(administrator.id, userId);
    request.log.info(
      {
        event: "admin.user_banned",
        administratorId: administrator.id,
        userId,
      },
      "user banned",
    );
    return adminUserSchema.parse(user);
  });

  app.post("/v1/admin/users/:userId/unban", async (request) => {
    const administrator = await requireAdministrator(
      auth,
      request.headers.cookie,
    );
    const { userId } = userParamsSchema.parse(request.params);
    const user = await auth.unbanUser(administrator.id, userId);
    request.log.info(
      {
        event: "admin.user_unbanned",
        administratorId: administrator.id,
        userId,
      },
      "user unbanned",
    );
    return adminUserSchema.parse(user);
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
    const administrator = await requireAdministrator(
      auth,
      request.headers.cookie,
    );
    const { gameId } = gameIdParamsSchema.parse(request.params);
    const input = updateGameSchema.parse(request.body);
    const game = await games.update(gameId, input);
    request.log.info(
      {
        event: "admin.game_updated",
        administratorId: administrator.id,
        gameId,
      },
      "game updated",
    );
    return adminGameSchema.parse(game);
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
      const administrator = await requireAdministrator(
        auth,
        request.headers.cookie,
      );
      const { gameId } = gameIdParamsSchema.parse(request.params);
      const input = createBuiltinPlayerSchema.parse(request.body);
      const player = await builtinPlayers.create(gameId, input);
      request.log.info(
        {
          event: "admin.platform_player_created",
          administratorId: administrator.id,
          gameId,
          playerId: player.id,
        },
        "platform player created",
      );
      return reply.code(201).send(adminBuiltinPlayerSchema.parse(player));
    },
  );

  app.patch("/v1/admin/builtin-players/:builtinPlayerId", async (request) => {
    const administrator = await requireAdministrator(
      auth,
      request.headers.cookie,
    );
    const { builtinPlayerId } = builtinPlayerParamsSchema.parse(request.params);
    const input = updateBuiltinPlayerSchema.parse(request.body);
    const player = await builtinPlayers.update(builtinPlayerId, input);
    request.log.info(
      {
        event: "admin.platform_player_updated",
        administratorId: administrator.id,
        playerId: builtinPlayerId,
      },
      "platform player updated",
    );
    return adminBuiltinPlayerSchema.parse(player);
  });

  app.post(
    "/v1/admin/builtin-players/:builtinPlayerId/versions",
    async (request, reply) => {
      const administrator = await requireAdministrator(
        auth,
        request.headers.cookie,
      );
      const { builtinPlayerId } = builtinPlayerParamsSchema.parse(
        request.params,
      );
      const input = createBuiltinPlayerVersionSchema.parse(request.body);
      const player = await builtinPlayers.createVersion(builtinPlayerId, input);
      request.log.info(
        {
          event: "admin.platform_player_version_created",
          administratorId: administrator.id,
          playerId: builtinPlayerId,
          version: player.latestVersion.version,
        },
        "platform player version created",
      );
      return reply.code(201).send(adminBuiltinPlayerSchema.parse(player));
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
    request.log.info(
      {
        event: "submission.accepted",
        userId: user.id,
        gameSlug,
        playerId: result.playerId,
        playerVersionId: result.playerVersionId,
        version: result.version,
        evaluationCount: result.evaluationIds.length,
      },
      "submission accepted",
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

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      request.log.debug(
        {
          event: "http.request_validation_failed",
          code: "INVALID_REQUEST",
          issueCount: error.issues.length,
        },
        "request validation failed",
      );
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "request validation failed",
        issues: error.issues,
      });
    }
    if (error instanceof HttpError) {
      const logContext = {
        event: "http.request_rejected",
        code: error.code,
        statusCode: error.statusCode,
      };
      if (error.statusCode >= 500) {
        request.log.warn(logContext, "request rejected by service");
      } else {
        request.log.debug(logContext, "request rejected by service");
      }
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
      });
    }
    request.log.error(
      { err: error, event: "http.request_failed" },
      "unhandled request error",
    );
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
