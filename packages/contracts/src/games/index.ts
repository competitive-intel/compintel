import { z } from "zod";

import { gomokuReplaySchema } from "./gomoku.js";
import { quoridorReplaySchema } from "./quoridor.js";

export const gameReplaySchema = z.discriminatedUnion("gameSlug", [
  gomokuReplaySchema,
  quoridorReplaySchema,
]);

export type GameReplay = z.infer<typeof gameReplaySchema>;

export * from "./gomoku.js";
export * from "./quoridor.js";
