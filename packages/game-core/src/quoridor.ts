export const QUORIDOR_PROTOCOL_VERSION = 1;
export const QUORIDOR_BOARD_SIZE = 9;
export const QUORIDOR_WALLS_PER_PLAYER = 10;
/** Each seat may play at most this many moves; after both reach the cap without a goal win, the match ends as move_limit. */
export const QUORIDOR_MAX_MOVES_PER_PLAYER = 100;

export type QuoridorSeat = 0 | 1;
export type QuoridorWallOrientation = 0 | 1;

export interface QuoridorPosition {
  x: number;
  y: number;
}

export interface QuoridorPawnMove extends QuoridorPosition {
  type: 0;
}

export interface QuoridorWallMove extends QuoridorPosition {
  type: 1;
  orientation: QuoridorWallOrientation;
}

export type QuoridorMove = QuoridorPawnMove | QuoridorWallMove;
export type QuoridorPlayedMove = QuoridorMove & { seat: QuoridorSeat };
export type QuoridorGameResult =
  | { type: "playing" }
  | { type: "win"; winner: QuoridorSeat }
  | { type: "move_limit" };

const CARDINAL_DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export class QuoridorGame {
  readonly #pawns: [QuoridorPosition, QuoridorPosition] = [
    { x: 4, y: 0 },
    { x: 4, y: 8 },
  ];
  readonly #walls: QuoridorWallMove[] = [];
  readonly #wallsRemaining: [number, number] = [
    QUORIDOR_WALLS_PER_PLAYER,
    QUORIDOR_WALLS_PER_PLAYER,
  ];
  readonly #moves: QuoridorPlayedMove[] = [];
  #nextSeat: QuoridorSeat = 0;
  #result: QuoridorGameResult = { type: "playing" };

  get nextSeat(): QuoridorSeat {
    return this.#nextSeat;
  }

  get result(): QuoridorGameResult {
    return this.#result;
  }

  get moves(): readonly QuoridorPlayedMove[] {
    return this.#moves;
  }

  get walls(): readonly QuoridorWallMove[] {
    return this.#walls;
  }

  pawn(seat: QuoridorSeat): QuoridorPosition {
    return { ...this.#pawns[seat] };
  }

  wallsRemaining(seat: QuoridorSeat): number {
    return this.#wallsRemaining[seat];
  }

  legalPawnMoves(seat: QuoridorSeat): QuoridorPosition[] {
    const origin = this.#pawns[seat];
    const opponent = this.#pawns[otherSeat(seat)];
    const moves: QuoridorPosition[] = [];

    for (const [dx, dy] of CARDINAL_DIRECTIONS) {
      const adjacent = { x: origin.x + dx, y: origin.y + dy };
      if (!this.#inside(adjacent) || this.#isBlocked(origin, adjacent))
        continue;
      if (!samePosition(adjacent, opponent)) {
        moves.push(adjacent);
        continue;
      }

      const behind = { x: opponent.x + dx, y: opponent.y + dy };
      if (this.#inside(behind) && !this.#isBlocked(opponent, behind)) {
        moves.push(behind);
        continue;
      }

      const sideDirections =
        dx === 0
          ? ([
              [-1, 0],
              [1, 0],
            ] as const)
          : ([
              [0, -1],
              [0, 1],
            ] as const);
      for (const [sideDx, sideDy] of sideDirections) {
        const diagonal = {
          x: opponent.x + sideDx,
          y: opponent.y + sideDy,
        };
        if (this.#inside(diagonal) && !this.#isBlocked(opponent, diagonal)) {
          moves.push(diagonal);
        }
      }
    }
    return moves;
  }

  play(seat: QuoridorSeat, move: QuoridorMove): QuoridorGameResult {
    if (this.#result.type !== "playing") {
      throw new Error("the quoridor game has already finished");
    }
    if (seat !== this.#nextSeat) {
      throw new Error(`it is seat ${this.#nextSeat}'s turn`);
    }

    if (move.type === 0) this.#movePawn(seat, move);
    else this.#placeWall(seat, move);
    this.#moves.push({ ...move, seat });

    const pawn = this.#pawns[seat];
    if ((seat === 0 && pawn.y === 8) || (seat === 1 && pawn.y === 0)) {
      this.#result = { type: "win", winner: seat };
    } else if (
      this.#movesPerSeat(0) >= QUORIDOR_MAX_MOVES_PER_PLAYER &&
      this.#movesPerSeat(1) >= QUORIDOR_MAX_MOVES_PER_PLAYER
    ) {
      this.#result = { type: "move_limit" };
    } else {
      this.#nextSeat = otherSeat(seat);
    }
    return this.#result;
  }

  #movesPerSeat(seat: QuoridorSeat): number {
    let count = 0;
    for (const move of this.#moves) {
      if (move.seat === seat) count += 1;
    }
    return count;
  }

  #movePawn(seat: QuoridorSeat, move: QuoridorPawnMove): void {
    if (
      !this.legalPawnMoves(seat).some((candidate) =>
        samePosition(candidate, move),
      )
    ) {
      throw new Error(`illegal pawn move to ${move.x} ${move.y}`);
    }
    this.#pawns[seat] = { x: move.x, y: move.y };
  }

  #placeWall(seat: QuoridorSeat, wall: QuoridorWallMove): void {
    if (this.#wallsRemaining[seat] === 0) {
      throw new Error(`seat ${seat} has no walls remaining`);
    }
    if (!this.#validWallCoordinate(wall)) {
      throw new Error("wall center coordinates must be integers inside 1..8");
    }
    if (wall.orientation !== 0 && wall.orientation !== 1) {
      throw new Error(
        "wall orientation must be 0 (vertical) or 1 (horizontal)",
      );
    }
    if (this.#walls.some((placed) => wallsConflict(placed, wall))) {
      throw new Error("wall overlaps or crosses an existing wall");
    }

    this.#walls.push({ ...wall });
    if (!this.#hasPathToGoal(0) || !this.#hasPathToGoal(1)) {
      this.#walls.pop();
      throw new Error("wall would block every path to a goal edge");
    }
    this.#wallsRemaining[seat] -= 1;
  }

  #hasPathToGoal(seat: QuoridorSeat): boolean {
    const start = this.#pawns[seat];
    const queue = [start];
    const visited = new Set([positionKey(start)]);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      if ((seat === 0 && current.y === 8) || (seat === 1 && current.y === 0)) {
        return true;
      }
      for (const [dx, dy] of CARDINAL_DIRECTIONS) {
        const next = { x: current.x + dx, y: current.y + dy };
        const key = positionKey(next);
        if (
          this.#inside(next) &&
          !visited.has(key) &&
          !this.#isBlocked(current, next)
        ) {
          visited.add(key);
          queue.push(next);
        }
      }
    }
    return false;
  }

  #isBlocked(from: QuoridorPosition, to: QuoridorPosition): boolean {
    if (from.x !== to.x) {
      const boundaryX = Math.max(from.x, to.x);
      const row = from.y;
      return this.#walls.some(
        (wall) =>
          wall.orientation === 0 &&
          wall.x === boundaryX &&
          (wall.y === row || wall.y === row + 1),
      );
    }
    const boundaryY = Math.max(from.y, to.y);
    const column = from.x;
    return this.#walls.some(
      (wall) =>
        wall.orientation === 1 &&
        wall.y === boundaryY &&
        (wall.x === column || wall.x === column + 1),
    );
  }

  #inside(position: QuoridorPosition): boolean {
    return (
      Number.isSafeInteger(position.x) &&
      Number.isSafeInteger(position.y) &&
      position.x >= 0 &&
      position.x < QUORIDOR_BOARD_SIZE &&
      position.y >= 0 &&
      position.y < QUORIDOR_BOARD_SIZE
    );
  }

  #validWallCoordinate(wall: QuoridorWallMove): boolean {
    return (
      Number.isSafeInteger(wall.x) &&
      Number.isSafeInteger(wall.y) &&
      wall.x >= 1 &&
      wall.x < QUORIDOR_BOARD_SIZE &&
      wall.y >= 1 &&
      wall.y < QUORIDOR_BOARD_SIZE
    );
  }
}

export function createQuoridorInitialization(seat: QuoridorSeat): string {
  return `${QUORIDOR_PROTOCOL_VERSION} ${seat}\n`;
}

export function formatQuoridorMove(move: QuoridorMove): string {
  return move.type === 0
    ? `0 ${move.x} ${move.y}\n`
    : `1 ${move.x} ${move.y} ${move.orientation}\n`;
}

export function parseQuoridorMove(output: string): QuoridorMove {
  const tokens = output.trim().split(/\s+/u);
  if (!tokens.every((token) => /^(?:0|[1-9]\d*)$/u.test(token))) {
    throw new Error("move fields must be non-negative integers");
  }
  const values = tokens.map(Number);
  if (!values.every(Number.isSafeInteger)) {
    throw new Error("move fields must be safe integers");
  }
  if (values[0] === 0 && values.length === 3) {
    return { type: 0, x: values[1]!, y: values[2]! };
  }
  if (
    values[0] === 1 &&
    values.length === 4 &&
    (values[3] === 0 || values[3] === 1)
  ) {
    return {
      type: 1,
      x: values[1]!,
      y: values[2]!,
      orientation: values[3],
    };
  }
  throw new Error("expected `0 <x> <y>` or `1 <x> <y> <orientation>`");
}

function wallsConflict(
  left: QuoridorWallMove,
  right: QuoridorWallMove,
): boolean {
  if (left.orientation !== right.orientation) {
    return left.x === right.x && left.y === right.y;
  }
  return left.orientation === 0
    ? left.x === right.x && Math.abs(left.y - right.y) <= 1
    : left.y === right.y && Math.abs(left.x - right.x) <= 1;
}

function otherSeat(seat: QuoridorSeat): QuoridorSeat {
  return seat === 0 ? 1 : 0;
}

function samePosition(
  left: QuoridorPosition,
  right: QuoridorPosition,
): boolean {
  return left.x === right.x && left.y === right.y;
}

function positionKey(position: QuoridorPosition): string {
  return `${position.x}:${position.y}`;
}
