import { loadApiConfig } from "@compintel/config";
import {
  PLAYER_EVALUATION_QUEUE,
  type PlayerEvaluationJob,
} from "@compintel/contracts";
import { createDbClient } from "@compintel/db";
import { Queue, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

import { buildApp } from "./app.js";
import { AuthService } from "./auth.js";
import { RedisEmailSendLimiter } from "./email-send-limiter.js";
import { SubmissionService } from "./submissions.js";
import { SystemSettingsService } from "./system-settings.js";
import { createTurnstileClient } from "./turnstile.js";

const config = loadApiConfig();
const db = createDbClient(config.DATABASE_URL);
const redisOptions = redisConnection(config.REDIS_URL);
const queue = new Queue<PlayerEvaluationJob>(PLAYER_EVALUATION_QUEUE, {
  connection: redisOptions,
});
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const submissions = new SubmissionService(db, queue);
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
  secureCookies: process.env.NODE_ENV === "production",
});

const shutdown = async (): Promise<void> => {
  await app.close();
  await queue.close();
  await redis.quit();
  await db.$disconnect();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

await app.listen({ host: config.API_HOST, port: config.API_PORT });

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
