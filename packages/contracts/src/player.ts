import { z } from "zod";

export const cppSourceSchema = z
  .string()
  .min(1, "sourceCode must not be empty")
  .max(256 * 1024, "sourceCode must not exceed 256 KiB");

export const createPlayerSchema = z.object({
  name: z.string().trim().min(1).max(64),
  sourceCode: cppSourceSchema,
});

export const createPlayerVersionSchema = z.object({
  sourceCode: cppSourceSchema,
});

export const submissionAcceptedSchema = z.object({
  playerId: z.string(),
  playerVersionId: z.string(),
  version: z.number().int().positive(),
  evaluationId: z.string(),
  evaluationStatus: z.literal("QUEUED"),
});

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type CreatePlayerVersionInput = z.infer<
  typeof createPlayerVersionSchema
>;
export type SubmissionAccepted = z.infer<typeof submissionAcceptedSchema>;
