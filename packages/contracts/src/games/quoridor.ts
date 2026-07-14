import { z } from "zod";

export const quoridorReplayMoveSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(0),
    x: z.number().int().min(0).max(8),
    y: z.number().int().min(0).max(8),
    seat: z.union([z.literal(0), z.literal(1)]),
  }),
  z.object({
    type: z.literal(1),
    x: z.number().int().min(1).max(8),
    y: z.number().int().min(1).max(8),
    orientation: z.union([z.literal(0), z.literal(1)]),
    seat: z.union([z.literal(0), z.literal(1)]),
  }),
]);

export const quoridorReplayResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("playing") }),
  z.object({
    type: z.literal("win"),
    winner: z.union([z.literal(0), z.literal(1)]),
  }),
  z.object({ type: z.literal("move_limit") }),
]);

export const quoridorReplaySchema = z.object({
  gameSlug: z.literal("quoridor"),
  userSeat: z.union([z.literal(0), z.literal(1)]),
  moves: z.array(quoridorReplayMoveSchema),
  result: quoridorReplayResultSchema,
});

export type QuoridorReplay = z.infer<typeof quoridorReplaySchema>;
