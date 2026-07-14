import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@compintel/db";

import { EvaluationRecordService } from "../src/evaluation-records.js";

test("lists every user version for a published game and summarizes progress", async () => {
  let countWhere: unknown;
  let listInput: { skip?: number; take?: number; where?: unknown } = {};
  const db = {
    game: {
      async findFirst() {
        return { id: "game-1" };
      },
    },
    playerVersion: {
      async count(input: { where: unknown }) {
        countWhere = input.where;
        return 21;
      },
      async findMany(input: { skip: number; take: number; where: unknown }) {
        listInput = input;
        return [
          versionRow({
            evaluations: [
              { status: "FINISHED", won: true },
              { status: "RUNNING", won: false },
            ],
          }),
        ];
      },
    },
    async $transaction(values: Array<Promise<unknown>>) {
      return Promise.all(values);
    },
  } as unknown as PrismaClient;

  const result = await new EvaluationRecordService(db).listForGame("gomoku", {
    page: 2,
    pageSize: 20,
  });

  assert.deepEqual(countWhere, {
    player: { gameId: "game-1", kind: "USER" },
  });
  assert.equal(listInput.skip, 20);
  assert.equal(listInput.take, 20);
  assert.equal(result.submissions[0]?.author.username, "other-user");
  assert.equal(result.submissions[0]?.status, "RUNNING");
  assert.equal(result.submissions[0]?.score, null);
  assert.deepEqual(result.submissions[0]?.evaluationSummary, {
    total: 2,
    finished: 1,
    won: 1,
  });
});

test("returns public source and serializes evaluation metrics", async () => {
  const db = {
    playerVersion: {
      async findFirst() {
        return versionRow({
          player: {
            name: "other-bot",
            owner: {
              id: "user-2",
              username: "other-user",
              displayName: "其他用户",
            },
            game: {
              slug: "gomoku",
              name: "五子棋",
              rulesVersion: "gomoku-v1",
            },
          },
          evaluations: [evaluationRow()],
        });
      },
    },
  } as unknown as PrismaClient;

  const result = await new EvaluationRecordService(db).getDetail(
    "player-version-1",
  );

  assert.equal(result.sourceCode, "int main() {}");
  assert.equal(result.author.username, "other-user");
  assert.equal(result.evaluations[0]?.cpuTimeNs, "1000000");
  assert.equal(result.evaluations[0]?.opponentVersion, 3);
});

function versionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "player-version-1",
    playerId: "player-1",
    version: 1,
    language: "CPP" as const,
    sourceCode: "int main() {}",
    sourceSha256:
      "00096d96da5299e65479678a8e79b07ab36e6185120e892a1360e1be25e84fbb",
    createdAt: new Date("2026-07-13T08:00:00.000Z"),
    score: null,
    player: {
      name: "other-bot",
      owner: {
        id: "user-2",
        username: "other-user",
        displayName: "其他用户",
      },
    },
    evaluations: [],
    ...overrides,
  };
}

function evaluationRow() {
  return {
    id: "evaluation-1",
    opponentVersionId: "opponent-version-1",
    opponentWeight: 4,
    won: true,
    status: "FINISHED" as const,
    verdict: "ACCEPTED" as const,
    compileStatus: "Accepted",
    compileLog: "",
    runStatus: "Accepted",
    stdout: "7 7\n",
    stderr: "",
    cpuTimeNs: 1_000_000n,
    wallTimeNs: 2_000_000n,
    memoryBytes: 1_048_576n,
    errorMessage: null,
    replay: null,
    opponentVersion: {
      version: 3,
      player: { name: "基准程序" },
    },
    createdAt: new Date("2026-07-13T08:00:00.000Z"),
    startedAt: new Date("2026-07-13T08:00:01.000Z"),
    finishedAt: new Date("2026-07-13T08:00:02.000Z"),
  };
}
