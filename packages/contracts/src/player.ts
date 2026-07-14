import { z } from "zod";

export const cppSourceSchema = z
  .string()
  .min(1, "sourceCode must not be empty")
  .max(256 * 1024, "sourceCode must not exceed 256 KiB");

export const createPlayerSchema = z.object({
  name: z.string().trim().min(1).max(64),
  sourceCode: cppSourceSchema,
});

export const builtinPlayerVersionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  language: z.literal("CPP"),
  sourceCode: cppSourceSchema,
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.iso.datetime(),
});

export const adminBuiltinPlayerSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  weight: z.number().int().positive(),
  versionCount: z.number().int().positive(),
  latestVersion: builtinPlayerVersionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const adminBuiltinPlayerListSchema = z.object({
  players: z.array(adminBuiltinPlayerSchema),
});

export const createBuiltinPlayerSchema = z.object({
  name: z.string().trim().min(1).max(64),
  sourceCode: cppSourceSchema,
  isActive: z.boolean().default(true),
  weight: z.number().int().positive().default(1),
});

export const updateBuiltinPlayerSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    isActive: z.boolean().optional(),
    weight: z.number().int().positive().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "至少需要修改一个字段",
  });

export const createBuiltinPlayerVersionSchema = z.object({
  sourceCode: cppSourceSchema,
});

export const submissionAcceptedSchema = z.object({
  playerId: z.string(),
  playerVersionId: z.string(),
  version: z.number().int().positive(),
  evaluationIds: z.array(z.string()).min(1),
  evaluationStatus: z.literal("QUEUED"),
});

export const playerNameListSchema = z.object({
  names: z.array(z.string()),
});

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type SubmissionAccepted = z.infer<typeof submissionAcceptedSchema>;
export type PlayerNameList = z.infer<typeof playerNameListSchema>;
export type BuiltinPlayerVersion = z.infer<typeof builtinPlayerVersionSchema>;
export type AdminBuiltinPlayer = z.infer<typeof adminBuiltinPlayerSchema>;
export type CreateBuiltinPlayerInput = z.infer<
  typeof createBuiltinPlayerSchema
>;
export type UpdateBuiltinPlayerInput = z.infer<
  typeof updateBuiltinPlayerSchema
>;
export type CreateBuiltinPlayerVersionInput = z.infer<
  typeof createBuiltinPlayerVersionSchema
>;
