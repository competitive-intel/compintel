import { loadApiConfig } from "@compintel/config";
import {
  PLAYER_EVALUATION_QUEUE,
  type PlayerEvaluationJob,
} from "@compintel/contracts";
import { createDbClient } from "@compintel/db";
import { createLogger } from "@compintel/logger";
import { Queue, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

import { buildApp } from "./app.js";
import { AuthService } from "./auth.js";
import { RedisEmailSendLimiter } from "./email-send-limiter.js";
import { EvaluationWorkerStatusService } from "./evaluation-worker-status.js";
import { SubmissionService } from "./submissions.js";
import { SystemSettingsService } from "./system-settings.js";
import { createTurnstileClient } from "./turnstile.js";

const config = loadApiConfig();
const logger = createLogger({
  service: "compintel-api",
  level: config.LOG_LEVEL,
  environment: config.NODE_ENV,
});
const db = createDbClient(config.DATABASE_URL);
const redisOptions = redisConnection(config.REDIS_URL);
const queue = new Queue<PlayerEvaluationJob>(PLAYER_EVALUATION_QUEUE, {
  connection: redisOptions,
});
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const workerStatus = new EvaluationWorkerStatusService(
  queue,
  logger.child({ component: "evaluation-worker-status" }),
);
const submissions = new SubmissionService(
  db,
  queue,
  logger.child({ component: "submission-service" }),
  workerStatus,
);
const systemSettings = new SystemSettingsService(db, {
  tencentSesSecretId: config.TENCENT_SES_SECRET_ID,
  tencentSesSecretKey: config.TENCENT_SES_SECRET_KEY,
});
const auth = new AuthService(db, {
  settings: systemSettings,
  emailSendLimiter: new RedisEmailSendLimiter(redis),
  turnstile: createTurnstileClient(),
});
const app = buildApp({
  db,
  submissions,
  auth,
  systemSettings,
  workerStatus,
  secureCookies: config.NODE_ENV === "production",
  logger: logger.child({ component: "http" }),
});

queue.on("error", (error) => {
  logger.error(
    {
      err: error,
      event: "queue.client_error",
      component: "evaluation-queue",
    },
    "evaluation queue error",
  );
});
redis.on("error", (error) => {
  logger.error(
    { err: error, event: "redis.connection_error", component: "redis" },
    "redis connection error",
  );
});

let shuttingDown = false;
const shutdown = async (reason: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: "api.shutting_down", reason }, "api shutting down");
  const failures: unknown[] = [];
  try {
    await app.close();
  } catch (error) {
    failures.push(error);
  }
  const results = await Promise.allSettled([
    queue.close(),
    redis.quit(),
    db.$disconnect(),
  ]);
  failures.push(
    ...results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    ),
  );
  if (failures.length === 0) {
    logger.info({ event: "api.stopped" }, "api stopped");
  } else {
    logger.error(
      {
        err: failures[0],
        event: "api.shutdown_failed",
        failureCount: failures.length,
      },
      "api shutdown completed with errors",
    );
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  const address = await app.listen({
    host: config.API_HOST,
    port: config.API_PORT,
  });
  logger.info({ event: "api.started", address }, "api started");
  await workerStatus.get().catch(() => undefined);
} catch (error) {
  logger.fatal(
    { err: error, event: "api.startup_failed" },
    "api failed to start",
  );
  await shutdown("startup_failure");
  process.exitCode = 1;
}

function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const database = Number(url.pathname.slice(1) || "0");
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    db: database,
    maxRetriesPerRequest: null,
    ...(url.username === ""
      ? {}
      : { username: decodeURIComponent(url.username) }),
    ...(url.password === ""
      ? {}
      : { password: decodeURIComponent(url.password) }),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
