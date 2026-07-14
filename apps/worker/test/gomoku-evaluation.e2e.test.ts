import assert from "node:assert/strict";
import test from "node:test";

import { GoJudgeClient } from "@compintel/judge-client";

import { runGomokuEvaluation } from "../src/evaluation-processor.js";

const judgeUrl = process.env.JUDGE_E2E_URL;

test(
  "compiles and coordinates two C++ bots in go-judge",
  { skip: judgeUrl === undefined },
  async () => {
    const judge = new GoJudgeClient({
      baseUrl: judgeUrl!,
      ...(process.env.JUDGE_E2E_AUTH_TOKEN === undefined
        ? {}
        : { authToken: process.env.JUDGE_E2E_AUTH_TOKEN }),
      requestTimeoutMs: 30_000,
    });
    const [playerCompilation, opponentCompilation] = await Promise.all([
      judge.compileCpp(FIRST_EMPTY_CPP),
      judge.compileCpp(FIRST_EMPTY_CPP),
    ]);
    assert.notEqual(playerCompilation.executableFileId, null);
    assert.notEqual(opponentCompilation.executableFileId, null);

    const playerFileId = playerCompilation.executableFileId!;
    const opponentFileId = opponentCompilation.executableFileId!;
    try {
      const [player, opponent] = await Promise.all([
        judge.startInteractive(playerFileId, LIMITS),
        judge.startInteractive(opponentFileId, LIMITS),
      ]);
      const run = await runGomokuEvaluation(player, opponent);
      assert.equal(run.verdict, "ACCEPTED");
      assert.ok(run.replay.moves.length > 2);
      assert.ok(run.playerTotalCpuNs <= LIMITS.totalCpuLimitNs);
      assert.ok(run.opponentTotalCpuNs <= LIMITS.totalCpuLimitNs);
    } finally {
      await Promise.all([
        judge.deleteFile(playerFileId),
        judge.deleteFile(opponentFileId),
      ]);
    }
  },
);

const LIMITS = {
  moveCpuLimitNs: 100_000_000,
  totalCpuLimitNs: 5_000_000_000,
  wallLimitNs: 1_000_000_000,
  maxOutputBytes: 64,
  memoryLimitBytes: 256 * 1024 * 1024,
  stackLimitBytes: 128 * 1024 * 1024,
  processLimit: 8,
};

const FIRST_EMPTY_CPP = String.raw`
#include <iostream>
#include <vector>

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);

  int version, height, width, seat;
  if (!(std::cin >> version >> height >> width >> seat)) return 1;
  std::vector<std::vector<int>> board(height, std::vector<int>(width));

  while (true) {
    if (seat == 1 || board[0][0] != 0) {
      int opponent_x, opponent_y;
      if (!(std::cin >> opponent_x >> opponent_y)) return 0;
      board[opponent_x][opponent_y] = 1;
    }

    bool moved = false;
    for (int x = 0; x < height && !moved; ++x) {
      for (int y = 0; y < width; ++y) {
        if (board[x][y] == 0) {
          board[x][y] = 1;
          std::cout << x << ' ' << y << std::endl;
          moved = true;
          break;
        }
      }
    }
    seat = 1;
  }
}
`;
