import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@compintel/db";

import { PrismaEvaluationRepository } from "../src/prisma-evaluation-repository.js";

test("marks a defeated opponent and persists the weighted score", async () => {
  const evaluations = [
    {
      id: "evaluation-1",
      status: "RUNNING",
      opponentWeight: 2,
      won: false,
    },
    {
      id: "evaluation-2",
      status: "FINISHED",
      opponentWeight: 1,
      won: false,
    },
  ];
  let savedScore: number | undefined;
  const transaction = {
    evaluation: {
      async findUnique() {
        return { playerVersionId: "player-version-1" };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const evaluation = evaluations.find((row) => row.id === where.id);
        assert.ok(evaluation);
        Object.assign(evaluation, data);
      },
      async findMany() {
        return evaluations;
      },
    },
    playerVersion: {
      async update({ data }: { data: { score: number } }) {
        savedScore = data.score;
      },
    },
    async $queryRaw() {
      return [];
    },
  };
  const db = {
    async $transaction(
      callback: (tx: typeof transaction) => Promise<void>,
    ): Promise<void> {
      await callback(transaction);
    },
  } as unknown as PrismaClient;

  await new PrismaEvaluationRepository(db).finish("evaluation-1", {
    verdict: "ACCEPTED",
    replay: {
      gameSlug: "gomoku",
      width: 15,
      height: 15,
      userSeat: 1,
      moves: [],
      result: { type: "win", winner: 1 },
    },
  });

  assert.equal(evaluations[0]?.won, true);
  assert.equal(savedScore, 66);
});
