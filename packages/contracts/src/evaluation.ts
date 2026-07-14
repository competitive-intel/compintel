import { z } from "zod";

import { gameReplaySchema } from "./games/index.js";
import { cppSourceSchema } from "./player.js";

export * from "./games/index.js";

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

export const submissionEvaluationStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "FINISHED",
]);

export const evaluationSchema = z.object({
  id: z.string(),
  opponentVersionId: z.string(),
  opponentName: z.string(),
  opponentVersion: z.number().int().positive(),
  opponentWeight: z.number().int().positive(),
  won: z.boolean(),
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
  replay: gameReplaySchema.nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});

export const submissionAuthorSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
});

export const submissionEvaluationSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  finished: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
});

export const submissionRecordSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  playerName: z.string(),
  version: z.number().int().positive(),
  language: z.literal("CPP"),
  author: submissionAuthorSchema,
  status: submissionEvaluationStatusSchema,
  evaluationSummary: submissionEvaluationSummarySchema,
  score: z.number().int().min(0).max(100).nullable(),
  createdAt: z.iso.datetime(),
});

export const submissionRecordListSchema = z.object({
  submissions: z.array(submissionRecordSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const submissionDetailSchema = submissionRecordSchema.extend({
  game: z.object({
    slug: z.string(),
    name: z.string(),
    rulesVersion: z.string(),
  }),
  sourceCode: cppSourceSchema,
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  evaluations: z.array(evaluationSchema),
});

export type Evaluation = z.infer<typeof evaluationSchema>;
export type SubmissionRecord = z.infer<typeof submissionRecordSchema>;
export type SubmissionRecordList = z.infer<typeof submissionRecordListSchema>;
export type SubmissionDetail = z.infer<typeof submissionDetailSchema>;
