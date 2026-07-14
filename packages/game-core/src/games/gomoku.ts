/** Gomoku rules and protocol implementation. */
export const GOMOKU_PROTOCOL_VERSION = 1;
export const GOMOKU_BOARD_HEIGHT = 15;
export const GOMOKU_BOARD_WIDTH = 15;

export type GomokuSeat = 0 | 1;

export interface GomokuMove {
  x: number;
  y: number;
}

export interface GomokuPlayedMove extends GomokuMove {
  seat: GomokuSeat;
}

export type GomokuGameResult =
  { type: "playing" } | { type: "win"; winner: GomokuSeat } | { type: "draw" };

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

export class GomokuGame {
  readonly #board: Array<GomokuSeat | null>;
  readonly #moves: GomokuPlayedMove[] = [];
  #nextSeat: GomokuSeat = 0;
  #result: GomokuGameResult = { type: "playing" };

  constructor(
    readonly height = GOMOKU_BOARD_HEIGHT,
    readonly width = GOMOKU_BOARD_WIDTH,
  ) {
    if (!Number.isSafeInteger(height) || !Number.isSafeInteger(width)) {
      throw new Error("gomoku board dimensions must be integers");
    }
    if (height < 5 || width < 5) {
      throw new Error("gomoku board dimensions must both be at least 5");
    }
    this.#board = Array<GomokuSeat | null>(height * width).fill(null);
  }

  get nextSeat(): GomokuSeat {
    return this.#nextSeat;
  }

  get result(): GomokuGameResult {
    return this.#result;
  }

  get moves(): readonly GomokuPlayedMove[] {
    return this.#moves;
  }

  at(move: GomokuMove): GomokuSeat | null {
    this.#assertInside(move);
    return this.#board[this.#index(move)]!;
  }

  isEmpty(move: GomokuMove): boolean {
    return this.#inside(move) && this.#board[this.#index(move)] === null;
  }

  emptyMoves(): GomokuMove[] {
    const moves: GomokuMove[] = [];
    for (let x = 0; x < this.height; x += 1) {
      for (let y = 0; y < this.width; y += 1) {
        const move = { x, y };
        if (this.isEmpty(move)) {
          moves.push(move);
        }
      }
    }
    return moves;
  }

  play(seat: GomokuSeat, move: GomokuMove): GomokuGameResult {
    if (this.#result.type !== "playing") {
      throw new Error("the gomoku game has already finished");
    }
    if (seat !== this.#nextSeat) {
      throw new Error(`it is seat ${this.#nextSeat}'s turn`);
    }
    this.#assertInside(move);
    if (!this.isEmpty(move)) {
      throw new Error(`position ${move.x} ${move.y} is already occupied`);
    }

    this.#board[this.#index(move)] = seat;
    this.#moves.push({ ...move, seat });

    if (this.#hasFive(seat, move)) {
      this.#result = { type: "win", winner: seat };
    } else if (this.#moves.length === this.height * this.width) {
      this.#result = { type: "draw" };
    } else {
      this.#nextSeat = otherSeat(seat);
    }
    return this.#result;
  }

  #hasFive(seat: GomokuSeat, move: GomokuMove): boolean {
    return DIRECTIONS.some(([dx, dy]) => {
      return (
        1 +
          this.#countDirection(seat, move, dx, dy) +
          this.#countDirection(seat, move, -dx, -dy) >=
        5
      );
    });
  }

  #countDirection(
    seat: GomokuSeat,
    move: GomokuMove,
    dx: number,
    dy: number,
  ): number {
    let count = 0;
    let current = { x: move.x + dx, y: move.y + dy };
    while (
      this.#inside(current) &&
      this.#board[this.#index(current)] === seat
    ) {
      count += 1;
      current = { x: current.x + dx, y: current.y + dy };
    }
    return count;
  }

  #assertInside(move: GomokuMove): void {
    if (!this.#inside(move)) {
      throw new Error(
        `move coordinates must be integers inside 0..${this.height - 1} and 0..${this.width - 1}`,
      );
    }
  }

  #inside(move: GomokuMove): boolean {
    return (
      Number.isSafeInteger(move.x) &&
      Number.isSafeInteger(move.y) &&
      move.x >= 0 &&
      move.x < this.height &&
      move.y >= 0 &&
      move.y < this.width
    );
  }

  #index(move: GomokuMove): number {
    return move.x * this.width + move.y;
  }
}

export function createGomokuInitialization(
  seat: GomokuSeat,
  height = GOMOKU_BOARD_HEIGHT,
  width = GOMOKU_BOARD_WIDTH,
): string {
  return `${GOMOKU_PROTOCOL_VERSION}\n${height} ${width}\n${seat}\n`;
}

export function formatGomokuMove(move: GomokuMove): string {
  return `${move.x} ${move.y}\n`;
}

export function parseGomokuMove(
  output: string,
  height = GOMOKU_BOARD_HEIGHT,
  width = GOMOKU_BOARD_WIDTH,
): GomokuMove {
  const tokens = output.trim().split(/\s+/u);
  if (tokens.length !== 2) {
    throw new Error("expected exactly two integers: <x> <y>");
  }

  if (!tokens.every((token) => /^(?:0|[1-9]\d*)$/u.test(token))) {
    throw new Error("move coordinates must be integers");
  }
  const x = Number(tokens[0]);
  const y = Number(tokens[1]);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new Error("move coordinates must be safe integers");
  }
  if (x >= height || y >= width) {
    throw new Error(
      `move coordinates must be inside 0..${height - 1} and 0..${width - 1}`,
    );
  }
  return { x, y };
}

function otherSeat(seat: GomokuSeat): GomokuSeat {
  return seat === 0 ? 1 : 0;
}
