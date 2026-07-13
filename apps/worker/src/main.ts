import { loadWorkerConfig } from "@compintel/config";
import {
  PLAYER_EVALUATION_JOB,
  PLAYER_EVALUATION_QUEUE,
  playerEvaluationJobSchema,
  type PlayerEvaluationJob,
} from "@compintel/contracts";
import { createDbClient } from "@compintel/db";
import { GoJudgeClient } from "@compintel/judge-client";
import { Worker, type ConnectionOptions } from "bullmq";

import { EvaluationProcessor } from "./evaluation-processor.js";
import { PrismaEvaluationRepository } from "./prisma-evaluation-repository.js";

const config = loadWorkerConfig();
const db = createDbClient(config.DATABASE_URL);
const repository = new PrismaEvaluationRepository(db);
const judge = new GoJudgeClient({
  baseUrl: config.JUDGE_URL,
  ...(config.JUDGE_AUTH_TOKEN === undefined
    ? {}
    : { authToken: config.JUDGE_AUTH_TOKEN }),
});
const processor = new EvaluationProcessor(repository, judge);

const worker = new Worker<PlayerEvaluationJob>(
  PLAYER_EVALUATION_QUEUE,
  async (job) => {
    if (job.name !== PLAYER_EVALUATION_JOB) {
      throw new Error(`unknown job: ${job.name}`);
    }
    const { evaluationId } = playerEvaluationJobSchema.parse(job.data);
    try {
      await processor.process(evaluationId);
    } catch (error) {
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade + 1 >= maxAttempts) {
        await repository.finish(evaluationId, {
          verdict: "INTERNAL_ERROR",
          errorMessage:
            error instanceof Error ? error.message : "evaluation failed",
        });
        return;
      }
      throw error;
    }
  },
  { connection: redisConnection(config.REDIS_URL), concurrency: 2 },
);

worker.on("failed", (job, error) => {
  console.error("evaluation job failed", {
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
    error: error.message,
  });
});

const shutdown = async (): Promise<void> => {
  await worker.close();
  await db.$disconnect();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

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
