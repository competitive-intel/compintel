import { z } from "zod";

export const PLAYER_EVALUATION_QUEUE = "player-evaluations";
export const PLAYER_EVALUATION_JOB = "evaluate-player-version";

export const playerEvaluationJobSchema = z.object({
  evaluationId: z.string().min(1),
});

export type PlayerEvaluationJob = z.infer<typeof playerEvaluationJobSchema>;

export const evaluationStatusSchema = z.enum([
  "QUEUED",
  "COMPILING",
  "RUNNING",
  "FINISHED",
]);

export const evaluationVerdictSchema = z.enum([
  "ACCEPTED",
  "COMPILE_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "DANGEROUS_SYSCALL",
  "INVALID_MOVE",
  "INTERNAL_ERROR",
]);

export const evaluationSchema = z.object({
  id: z.string(),
  playerVersionId: z.string(),
  opponentVersionId: z.string().nullable(),
  status: evaluationStatusSchema,
  verdict: evaluationVerdictSchema.nullable(),
  compileStatus: z.string().nullable(),
  compileLog: z.string().nullable(),
  runStatus: z.string().nullable(),
  stdout: z.string().nullable(),
  stderr: z.string().nullable(),
  cpuTimeNs: z.string().nullable(),
  wallTimeNs: z.string().nullable(),
  memoryBytes: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});

export type Evaluation = z.infer<typeof evaluationSchema>;
