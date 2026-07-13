import { z } from "zod";

export const gameSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  rulesVersion: z.string(),
});

export const gameListSchema = z.object({
  games: z.array(gameSummarySchema),
});
