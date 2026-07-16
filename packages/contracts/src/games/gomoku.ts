import { z } from "zod";

export const gomokuReplayMoveSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  seat: z.union([z.literal(0), z.literal(1)]),
});

export const gomokuReplayResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("playing") }),
  z.object({
    type: z.literal("win"),
    winner: z.union([z.literal(0), z.literal(1)]),
  }),
  z.object({ type: z.literal("draw") }),
]);

export const gomokuReplaySchema = z.object({
  gameSlug: z.literal("gomoku"),
  height: z.number().int().positive(),
  width: z.number().int().positive(),
  userSeat: z.union([z.literal(0), z.literal(1)]),
  moves: z.array(gomokuReplayMoveSchema),
  result: gomokuReplayResultSchema,
});

export type GomokuReplay = z.infer<typeof gomokuReplaySchema>;
