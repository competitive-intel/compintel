import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@compintel/db";

import { BuiltinPlayerService } from "../src/builtin-players.js";

test("creates a platform player with a database-backed C++ version", async () => {
  let createdData: Record<string, unknown> | undefined;
  const db = {
    game: {
      async findUnique() {
        return { id: "game-1" };
      },
    },
    player: {
      async findFirst() {
        return null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        createdData = data;
        return playerRow();
      },
    },
  } as unknown as PrismaClient;

  const player = await new BuiltinPlayerService(db).create("game-1", {
    name: "基准程序",
    sourceCode: "int main() {}",
    isActive: true,
    weight: 3,
  });

  assert.equal(createdData?.kind, "PLATFORM");
  assert.equal(createdData?.ownerId, null);
  assert.equal(createdData?.weight, 3);
  assert.deepEqual(createdData?.versions, {
    create: {
      version: 1,
      language: "CPP",
      sourceCode: "int main() {}",
      sourceSha256:
        "00096d96da5299e65479678a8e79b07ab36e6185120e892a1360e1be25e84fbb",
    },
  });
  assert.equal(player.latestVersion.language, "CPP");
});

test("creates an immutable next version when platform source changes", async () => {
  let createdVersion: Record<string, unknown> | undefined;
  const transaction = {
    playerVersion: {
      async findFirst() {
        return { version: 3, sourceSha256: "old-hash" };
      },
      async create({ data }: { data: Record<string, unknown> }) {
        createdVersion = data;
      },
    },
  };
  let playerLookup = 0;
  const db = {
    player: {
      async findFirst() {
        playerLookup += 1;
        return playerLookup === 1
          ? { id: "platform-1", gameId: "game-1", name: "基准程序" }
          : playerRow({
              versions: [
                {
                  ...playerRow().versions[0],
                  id: "version-4",
                  version: 4,
                  sourceCode: "int main() { return 0; }",
                },
              ],
              _count: { versions: 4 },
            });
      },
    },
    async $transaction(callback: (tx: typeof transaction) => Promise<void>) {
      return callback(transaction);
    },
  } as unknown as PrismaClient;

  const player = await new BuiltinPlayerService(db).createVersion(
    "platform-1",
    { sourceCode: "int main() { return 0; }" },
  );

  assert.equal(createdVersion?.version, 4);
  assert.equal(createdVersion?.language, "CPP");
  assert.equal(player.latestVersion.version, 4);
  assert.equal(player.versionCount, 4);
});

function playerRow(overrides: Partial<ReturnType<typeof basePlayerRow>> = {}) {
  return { ...basePlayerRow(), ...overrides };
}

function basePlayerRow() {
  return {
    id: "platform-1",
    gameId: "game-1",
    name: "基准程序",
    isActive: true,
    weight: 3,
    createdAt: new Date("2026-07-13T08:00:00.000Z"),
    updatedAt: new Date("2026-07-13T09:00:00.000Z"),
    versions: [
      {
        id: "version-1",
        version: 1,
        language: "CPP" as const,
        sourceCode: "int main() {}",
        sourceSha256:
          "00096d96da5299e65479678a8e79b07ab36e6185120e892a1360e1be25e84fbb",
        createdAt: new Date("2026-07-13T08:00:00.000Z"),
      },
    ],
    _count: { versions: 1 },
  };
}
