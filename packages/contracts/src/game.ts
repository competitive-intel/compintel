import { z } from "zod";

export const gameResourceLimitsSchema = z
  .object({
    moveCpuLimitMs: z.number().int().min(1).max(60_000),
    totalCpuLimitMs: z.number().int().min(1).max(600_000),
    memoryLimitMiB: z.number().int().min(16).max(4_096),
  })
  .refine((limits) => limits.totalCpuLimitMs >= limits.moveCpuLimitMs, {
    message: "整局 CPU 时间限制不能小于单步 CPU 时间限制",
    path: ["totalCpuLimitMs"],
  });

export const gameSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  summary: z.string(),
  rulesVersion: z.string(),
  resourceLimits: gameResourceLimitsSchema,
});

export const gameListSchema = z.object({
  games: z.array(gameSummarySchema),
});

export const gameDetailSchema = gameSummarySchema.extend({
  description: z.string(),
  rulesMarkdown: z.string(),
});

export const adminGameSchema = gameDetailSchema.extend({
  isPublished: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const adminGameListSchema = z.object({
  games: z.array(adminGameSchema),
});

const editableGameFields = {
  name: z.string().trim().min(2).max(40),
  summary: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(20_000),
  rulesMarkdown: z.string().trim().min(1).max(60_000),
  rulesVersion: z.string().trim().min(1).max(64),
  resourceLimits: gameResourceLimitsSchema,
  isPublished: z.boolean(),
};

export const updateGameSchema = z
  .object(editableGameFields)
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "至少需要修改一个字段",
  });

export type GameSummary = z.infer<typeof gameSummarySchema>;
export type GameDetail = z.infer<typeof gameDetailSchema>;
export type AdminGame = z.infer<typeof adminGameSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;
export type GameResourceLimits = z.infer<typeof gameResourceLimitsSchema>;
