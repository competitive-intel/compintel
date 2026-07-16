import { loadWorkerConfig } from "@compintel/config";
import {
  PLAYER_EVALUATION_JOB,
  PLAYER_EVALUATION_QUEUE,
  playerEvaluationJobSchema,
  type PlayerEvaluationJob,
} from "@compintel/contracts";
import { createDbClient } from "@compintel/db";
import { GoJudgeClient } from "@compintel/judge-client";
import { createLogger } from "@compintel/logger";
import { Worker, type ConnectionOptions } from "bullmq";

import { EvaluationProcessor } from "./evaluation-processor.js";
import { PrismaEvaluationRepository } from "./prisma-evaluation-repository.js";

const WORKER_CONCURRENCY = 2;
const config = loadWorkerConfig();
const logger = createLogger({
  service: "compintel-worker",
  level: config.LOG_LEVEL,
  environment: config.NODE_ENV,
});
const db = createDbClient(config.DATABASE_URL);
const repository = new PrismaEvaluationRepository(db);
const judge = new GoJudgeClient({
  baseUrl: config.JUDGE_URL,
  ...(config.JUDGE_AUTH_TOKEN === undefined
    ? {}
    : { authToken: config.JUDGE_AUTH_TOKEN }),
});
const processor = new EvaluationProcessor(
  repository,
  judge,
  logger.child({ component: "evaluation-processor" }),
);

const worker = new Worker<PlayerEvaluationJob>(
  PLAYER_EVALUATION_QUEUE,
  async (job) => {
    const jobLogger = logger.child({
      component: "evaluation-worker",
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
    });
    if (job.name !== PLAYER_EVALUATION_JOB) {
      jobLogger.error(
        { event: "queue.unknown_job" },
        "received unknown evaluation job",
      );
      throw new Error(`unknown job: ${job.name}`);
    }
    const { evaluationId } = playerEvaluationJobSchema.parse(job.data);
    const evaluationJobLogger = jobLogger.child({ evaluationId });
    evaluationJobLogger.info(
      { event: "queue.job_processing_started" },
      "evaluation job processing started",
    );
    try {
      await processor.process(evaluationId);
    } catch (error) {
      const maxAttempts = job.opts.attempts ?? 1;
      const attempt = job.attemptsMade + 1;
      if (attempt >= maxAttempts) {
        evaluationJobLogger.error(
          { err: error, event: "queue.job_retries_exhausted", maxAttempts },
          "evaluation job exhausted retries",
        );
        await repository.finish(evaluationId, {
          verdict: "INTERNAL_ERROR",
          errorMessage:
            error instanceof Error ? error.message : "evaluation failed",
        });
        evaluationJobLogger.info(
          { event: "queue.job_internal_error_persisted" },
          "evaluation marked as internal error",
        );
        return;
      }
      evaluationJobLogger.warn(
        {
          err: error,
          event: "queue.job_retry_scheduled",
          maxAttempts,
          nextAttempt: attempt + 1,
        },
        "evaluation job will be retried",
      );
      throw error;
    }
  },
  {
    connection: redisConnection(config.REDIS_URL),
    concurrency: WORKER_CONCURRENCY,
  },
);

worker.on("active", (job, previousState) => {
  logger.info(
    {
      event: "queue.job_active",
      jobId: job.id,
      evaluationId: job.data.evaluationId,
      attempt: job.attemptsMade + 1,
      previousState,
    },
    "evaluation job active",
  );
});

worker.on("completed", (job) => {
  logger.info(
    {
      event: "queue.job_completed",
      jobId: job.id,
      evaluationId: job.data.evaluationId,
      attemptsMade: job.attemptsMade,
    },
    "evaluation job completed",
  );
});

worker.on("failed", (job, error) => {
  const maxAttempts = job?.opts.attempts ?? 1;
  const willRetry = job !== undefined && job.attemptsMade < maxAttempts;
  const context = {
    err: error,
    event: "queue.job_failed",
    jobId: job?.id,
    evaluationId: job?.data.evaluationId,
    attemptsMade: job?.attemptsMade,
    maxAttempts,
    willRetry,
  };
  if (willRetry) {
    logger.warn(context, "evaluation job attempt failed");
  } else {
    logger.error(context, "evaluation job failed");
  }
});

worker.on("stalled", (jobId, previousState) => {
  logger.warn(
    { event: "queue.job_stalled", jobId, previousState },
    "evaluation job stalled",
  );
});

worker.on("error", (error) => {
  logger.error({ err: error, event: "queue.worker_error" }, "worker error");
});

let shuttingDown = false;
const shutdown = async (reason: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(
    { event: "worker.shutting_down", reason },
    "worker shutting down",
  );
  const results = await Promise.allSettled([worker.close(), db.$disconnect()]);
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failures.length === 0) {
    logger.info({ event: "worker.stopped" }, "worker stopped");
  } else {
    logger.error(
      {
        err: failures[0],
        event: "worker.shutdown_failed",
        failureCount: failures.length,
      },
      "worker shutdown completed with errors",
    );
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

logger.info(
  {
    event: "worker.starting",
    queue: PLAYER_EVALUATION_QUEUE,
    concurrency: WORKER_CONCURRENCY,
    judgeOrigin: new URL(config.JUDGE_URL).origin,
  },
  "worker starting",
);
try {
  await worker.waitUntilReady();
  logger.info(
    {
      event: "worker.started",
      queue: PLAYER_EVALUATION_QUEUE,
      concurrency: WORKER_CONCURRENCY,
    },
    "worker started",
  );
} catch (error) {
  logger.fatal(
    { err: error, event: "worker.startup_failed" },
    "worker failed to start",
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
