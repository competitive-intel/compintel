import assert from "node:assert/strict";
import test from "node:test";

import { GAME_CATALOGS } from "../prisma/games/index.js";
import { seedDatabase, type SeedDatabase } from "../prisma/seed-data.js";

type SystemSettingsCreateManyArgs = Parameters<
  SeedDatabase["systemSettings"]["createMany"]
>[0];
type UserCreateManyArgs = Parameters<SeedDatabase["user"]["createMany"]>[0];
type GameCreateManyArgs = Parameters<SeedDatabase["game"]["createMany"]>[0];

test("inserts seed records without defining an update path", async () => {
  const calls = createCallRecorder();

  await seedDatabase(calls.db, {
    ADMIN_USERNAME: "InitialAdmin",
    ADMIN_DISPLAY_NAME: "初始管理员",
    ADMIN_PASSWORD: "secret-password",
  });

  assert.deepEqual(calls.systemSettings, [
    {
      data: {
        id: "default",
        allowedEmailProviders: ["gmail.com", "qq.com", "163.com", "126.com"],
      },
      skipDuplicates: true,
    },
  ]);
  assert.deepEqual(calls.games, [
    {
      data: GAME_CATALOGS.map(({ slug, catalog }) => ({ slug, ...catalog })),
      skipDuplicates: true,
    },
  ]);
  assert.equal(calls.users.length, 1);
  const administrator = calls.users[0];
  assert.equal(administrator?.skipDuplicates, true);
  assert.equal(Array.isArray(administrator?.data), false);
  if (administrator === undefined || Array.isArray(administrator.data)) {
    assert.fail("expected one administrator createMany input");
  }
  assert.equal(administrator.data.username, "initialadmin");
  assert.equal(administrator.data.displayName, "初始管理员");
  assert.equal(administrator.data.role, "ADMIN");
  assert.equal(administrator.data.email, "initialadmin@compintel.local");
  assert.match(administrator.data.passwordHash, /^scrypt\$16384\$8\$1\$/);
});

test("skips administrator insertion when ADMIN_PASSWORD is missing", async () => {
  const calls = createCallRecorder();
  const warnings: string[] = [];

  await seedDatabase(calls.db, {}, (message) => warnings.push(message));

  assert.deepEqual(calls.users, []);
  assert.deepEqual(warnings, [
    "ADMIN_PASSWORD is not set; skipping administrator seed",
  ]);
});

function createCallRecorder(): {
  db: SeedDatabase;
  systemSettings: SystemSettingsCreateManyArgs[];
  users: UserCreateManyArgs[];
  games: GameCreateManyArgs[];
} {
  const systemSettings: SystemSettingsCreateManyArgs[] = [];
  const users: UserCreateManyArgs[] = [];
  const games: GameCreateManyArgs[] = [];

  return {
    db: {
      systemSettings: {
        async createMany(args) {
          systemSettings.push(args);
        },
      },
      user: {
        async createMany(args) {
          users.push(args);
        },
      },
      game: {
        async createMany(args) {
          games.push(args);
        },
      },
    },
    systemSettings,
    users,
    games,
  };
}
