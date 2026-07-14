import assert from "node:assert/strict";
import test from "node:test";

import {
  submissionDetailSchema,
  submissionRecordListSchema,
} from "../src/index.js";

const record = {
  id: "version-1",
  playerId: "player-1",
  playerName: "center-bot",
  version: 2,
  language: "CPP",
  author: {
    id: "user-1",
    username: "alice",
    displayName: "Alice",
  },
  status: "FINISHED",
  evaluationSummary: { total: 2, finished: 2, won: 1 },
  score: 50,
  createdAt: "2026-07-13T08:00:00.000Z",
} as const;

test("accepts an empty paginated submission record list", () => {
  const result = submissionRecordListSchema.parse({
    submissions: [],
    page: 1,
    pageSize: 20,
    total: 0,
  });
  assert.equal(result.total, 0);
});

test("exposes source code and opponent results on submission details", () => {
  const result = submissionDetailSchema.parse({
    ...record,
    game: { slug: "gomoku", name: "五子棋", rulesVersion: "gomoku-v1" },
    sourceCode: "int main() {}",
    sourceSha256:
      "00096d96da5299e65479678a8e79b07ab36e6185120e892a1360e1be25e84fbb",
    evaluations: [
      {
        id: "evaluation-1",
        opponentVersionId: "opponent-version-1",
        opponentName: "基准程序",
        opponentVersion: 3,
        opponentWeight: 2,
        won: true,
        status: "FINISHED",
        verdict: "ACCEPTED",
        compileStatus: "Accepted",
        compileLog: "",
        runStatus: "Accepted",
        stdout: "7 7\n",
        stderr: "",
        cpuTimeNs: "1000000",
        wallTimeNs: "2000000",
        memoryBytes: "1048576",
        errorMessage: null,
        replay: null,
        createdAt: "2026-07-13T08:00:00.000Z",
        startedAt: "2026-07-13T08:00:01.000Z",
        finishedAt: "2026-07-13T08:00:02.000Z",
      },
    ],
  });
  assert.equal(result.sourceCode, "int main() {}");
  assert.equal(result.evaluations[0]?.opponentVersion, 3);
});
