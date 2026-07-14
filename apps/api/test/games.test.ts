import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@compintel/db";

import { HttpError } from "../src/errors.js";
import { GameService } from "../src/games.js";

test("lists only the published game projection returned by the repository", async () => {
  let requestedPublished = false;
  const db = {
    game: {
      async findMany({ where }: { where: { isPublished: boolean } }) {
        requestedPublished = where.isPublished;
        return [gameRow()];
      },
    },
  } as unknown as PrismaClient;

  const games = await new GameService(db).listPublished();

  assert.equal(requestedPublished, true);
  assert.deepEqual(games, [
    {
      id: "game-1",
      slug: "gomoku",
      name: "五子棋",
      summary: "率先连成五子。",
      rulesVersion: "gomoku-v1",
      resourceLimits: {
        moveCpuLimitMs: 100,
        totalCpuLimitMs: 5_000,
        memoryLimitMiB: 256,
      },
    },
  ]);
});

test("does not expose an unpublished game detail", async () => {
  const db = {
    game: {
      async findFirst() {
        return null;
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    () => new GameService(db).getPublished("draft-game"),
    (error: unknown) =>
      error instanceof HttpError && error.code === "GAME_NOT_FOUND",
  );
});

function gameRow(overrides: Partial<ReturnType<typeof baseGameRow>> = {}) {
  return { ...baseGameRow(), ...overrides };
}

function baseGameRow() {
  return {
    id: "game-1",
    slug: "gomoku",
    name: "五子棋",
    summary: "率先连成五子。",
    description: "经典棋类游戏。",
    rulesMarkdown:
      "## 基本规则\n\n双方轮流落子。\n\n## 通信协议\n\n通过标准输入输出通信。",
    rulesVersion: "gomoku-v1",
    moveCpuLimitMs: 100,
    totalCpuLimitMs: 5_000,
    memoryLimitMiB: 256,
    isPublished: true,
    createdAt: new Date("2026-07-13T08:00:00.000Z"),
    updatedAt: new Date("2026-07-13T09:00:00.000Z"),
  };
}
