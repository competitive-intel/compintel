import { loadApiConfig } from "@compintel/config";
import {
  PLAYER_EVALUATION_QUEUE,
  type PlayerEvaluationJob,
} from "@compintel/contracts";
import { createDbClient } from "@compintel/db";
import { Queue, type ConnectionOptions } from "bullmq";

import { buildApp } from "./app.js";
import { SubmissionService } from "./submissions.js";

const config = loadApiConfig();
const db = createDbClient(config.DATABASE_URL);
const queue = new Queue<PlayerEvaluationJob>(PLAYER_EVALUATION_QUEUE, {
  connection: redisConnection(config.REDIS_URL),
});
const submissions = new SubmissionService(db, queue);
const app = buildApp({ db, submissions });

const shutdown = async (): Promise<void> => {
  await app.close();
  await queue.close();
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
