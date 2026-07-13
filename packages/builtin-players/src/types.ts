import type { GomokuGame, GomokuMove, GomokuSeat } from "@compintel/game-core";

export interface BuiltinPlayerContext {
  random: () => number;
}

export interface GomokuBuiltinPlayer {
  chooseMove(game: GomokuGame, seat: GomokuSeat): GomokuMove;
}

export interface GomokuBuiltinPlayerImplementation {
  readonly gameSlug: "gomoku";
  readonly implementationKey: string;
  create(context: BuiltinPlayerContext): GomokuBuiltinPlayer;
}

export type BuiltinPlayerImplementation = GomokuBuiltinPlayerImplementation;
