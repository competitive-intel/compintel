import { z } from "zod";

const baseServerSchema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
});

const apiSchema = baseServerSchema.extend({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Tencent Cloud SES SecretId; leave empty to disable outbound mail. */
  TENCENT_SES_SECRET_ID: z.string().default(""),
  /** Tencent Cloud SES SecretKey; leave empty to disable outbound mail. */
  TENCENT_SES_SECRET_KEY: z.string().default(""),
});

const workerSchema = baseServerSchema.extend({
  JUDGE_URL: z.url().default("http://localhost:5050"),
  JUDGE_AUTH_TOKEN: z.string().min(1).optional(),
});

export type ApiConfig = z.infer<typeof apiSchema>;
export type WorkerConfig = z.infer<typeof workerSchema>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return apiSchema.parse(env);
}

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const normalized = { ...env };
  if (normalized.JUDGE_AUTH_TOKEN === "") {
    delete normalized.JUDGE_AUTH_TOKEN;
  }
  return workerSchema.parse(normalized);
}
