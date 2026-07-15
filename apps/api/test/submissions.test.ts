import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@compintel/db";

import { HttpError } from "../src/errors.js";
import { SubmissionService } from "../src/submissions.js";

test("creates and enqueues one evaluation per built-in player", async () => {
  const createdEvaluations: Array<{
    playerVersionId: string;
    opponentVersionId: string;
    opponentWeight: number;
  }> = [];
  const queued: string[] = [];
  const transaction = {
    game: {
      async findFirst() {
        return { id: "game-1", slug: "gomoku", isPublished: true };
      },
    },
    user: {
      async upsert() {
        return { id: "user-1" };
      },
    },
    player: {
      async upsert() {
        return { id: "player-1", versions: [] };
      },
      async findMany() {
        return [
          { weight: 1, versions: [{ id: "opponent-version-1" }] },
          { weight: 5, versions: [{ id: "opponent-version-2" }] },
        ];
      },
    },
    playerVersion: {
      async count() {
        return 0;
      },
      async create() {
        return { id: "player-version-1", version: 1 };
      },
    },
    evaluation: {
      async create({
        data,
      }: {
        data: {
          playerVersionId: string;
          opponentVersionId: string;
          opponentWeight: number;
        };
      }) {
        createdEvaluations.push(data);
        return { id: `evaluation-${createdEvaluations.length}` };
      },
    },
  };
  const db = {
    async $transaction(callback: (tx: typeof transaction) => unknown) {
      return callback(transaction);
    },
  } as unknown as PrismaClient;
  const queue = {
    async add(_name: string, data: { evaluationId: string }) {
      queued.push(data.evaluationId);
    },
  };

  const result = await new SubmissionService(db, queue).createPlayer(
    "user-1",
    "gomoku",
    { name: "bot", sourceCode: "int main() {}" },
  );

  assert.deepEqual(
    createdEvaluations.map((evaluation) => [
      evaluation.opponentVersionId,
      evaluation.opponentWeight,
    ]),
    [
      ["opponent-version-1", 1],
      ["opponent-version-2", 5],
    ],
  );
  assert.deepEqual(queued, ["evaluation-1", "evaluation-2"]);
  assert.deepEqual(result.evaluationIds, ["evaluation-1", "evaluation-2"]);
  assert.equal(result.version, 1);
});

test("reuses a same-name player and increments its version", async () => {
  let createdVersion = 0;
  const transaction = {
    game: {
      async findFirst() {
        return { id: "game-1", slug: "gomoku", isPublished: true };
      },
    },
    player: {
      async upsert() {
        return { id: "player-1", versions: [{ version: 4 }] };
      },
      async findMany() {
        return [{ weight: 1, versions: [{ id: "opponent-version-1" }] }];
      },
    },
    playerVersion: {
      async count() {
        return 0;
      },
      async create({ data }: { data: { version: number } }) {
        createdVersion = data.version;
        return { id: "player-version-5", version: data.version };
      },
    },
    evaluation: {
      async create() {
        return { id: "evaluation-1" };
      },
    },
  };
  const db = {
    async $transaction(callback: (tx: typeof transaction) => unknown) {
      return callback(transaction);
    },
  } as unknown as PrismaClient;
  const queue = { async add() {} };

  const result = await new SubmissionService(db, queue).createPlayer(
    "user-1",
    "gomoku",
    { name: "bot", sourceCode: "int main() {}" },
  );

  assert.equal(createdVersion, 5);
  assert.equal(result.playerId, "player-1");
  assert.equal(result.version, 5);
});

test("lists only the current user's player names for the game", async () => {
  let playerFilter: unknown;
  const db = {
    game: {
      async findFirst() {
        return { id: "game-1" };
      },
    },
    player: {
      async findMany({ where }: { where: unknown }) {
        playerFilter = where;
        return [{ name: "alpha" }, { name: "beta" }];
      },
    },
  } as unknown as PrismaClient;

  const names = await new SubmissionService(db, {
    async add() {},
  }).listPlayerNames("user-1", "gomoku");

  assert.deepEqual(names, ["alpha", "beta"]);
  assert.deepEqual(playerFilter, {
    gameId: "game-1",
    ownerId: "user-1",
    kind: "USER",
  });
});

test("rejects submissions when the 24h sliding window is full", async () => {
  const transaction = {
    game: {
      async findFirst() {
        return { id: "game-1", slug: "gomoku", isPublished: true };
      },
    },
    playerVersion: {
      async count() {
        return 50;
      },
      async create() {
        throw new Error("should not create a version when rate-limited");
      },
    },
  };
  const db = {
    async $transaction(callback: (tx: typeof transaction) => unknown) {
      return callback(transaction);
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new SubmissionService(db, { async add() {} }).createPlayer(
      "user-1",
      "gomoku",
      { name: "bot", sourceCode: "int main() {}" },
    ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 429 &&
      error.code === "SUBMISSION_RATE_LIMIT",
  );
});
