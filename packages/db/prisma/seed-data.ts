import { randomBytes, scryptSync } from "node:crypto";

import type { Prisma } from "../generated/client/client.js";

import { GAME_CATALOGS } from "./games/index.js";

export interface SeedDatabase {
  systemSettings: {
    createMany(args: Prisma.SystemSettingsCreateManyArgs): Promise<unknown>;
  };
  user: {
    createMany(args: Prisma.UserCreateManyArgs): Promise<unknown>;
  };
  game: {
    createMany(args: Prisma.GameCreateManyArgs): Promise<unknown>;
  };
}

export async function seedDatabase(
  db: SeedDatabase,
  environment: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn,
): Promise<void> {
  await db.systemSettings.createMany({
    data: {
      id: "default",
      allowedEmailProviders: ["gmail.com", "qq.com", "163.com", "126.com"],
    },
    skipDuplicates: true,
  });

  await createAdministrator(db, environment, warn);

  await db.game.createMany({
    data: GAME_CATALOGS.map(({ slug, catalog }) => ({ slug, ...catalog })),
    skipDuplicates: true,
  });
}

async function createAdministrator(
  db: SeedDatabase,
  environment: NodeJS.ProcessEnv,
  warn: (message: string) => void,
): Promise<void> {
  const password = environment.ADMIN_PASSWORD;
  if (password === undefined || password === "") {
    warn("ADMIN_PASSWORD is not set; skipping administrator seed");
    return;
  }

  const username = (environment.ADMIN_USERNAME ?? "admin").toLowerCase();
  const displayName = environment.ADMIN_DISPLAY_NAME ?? "平台管理员";
  const email = `${username}@compintel.local`;
  await db.user.createMany({
    data: {
      username,
      displayName,
      passwordHash: hashPassword(password),
      role: "ADMIN",
      email,
      emailNormalized: email,
      emailVerifiedAt: new Date(),
    },
    skipDuplicates: true,
  });
}

function hashPassword(password: string): string {
  const parameters = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1_024 * 1_024 };
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64, parameters);
  return [
    "scrypt",
    parameters.N,
    parameters.r,
    parameters.p,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}
