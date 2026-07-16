import { randomBytes, scryptSync } from "node:crypto";

import { createDbClient } from "../src/index.js";
import { GAME_CATALOGS } from "./games/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is required");
}

const db = createDbClient(databaseUrl);

try {
  await ensureSystemSettings();
  await ensureAdministrator();
  for (const { slug, catalog } of GAME_CATALOGS) {
    await db.game.upsert({
      where: { slug },
      update: catalog,
      create: { slug, ...catalog },
    });
  }
} finally {
  await db.$disconnect();
}

async function ensureSystemSettings(): Promise<void> {
  await db.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      allowedEmailProviders: ["gmail.com", "qq.com", "163.com", "126.com"],
    },
  });
}

async function ensureAdministrator(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
  if (password === undefined || password === "") {
    console.warn("ADMIN_PASSWORD is not set; skipping administrator seed");
    return;
  }
  const username = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? "平台管理员";
  const passwordHash = hashPassword(password);
  const email = `${username}@compintel.local`;
  await db.user.upsert({
    where: { username },
    update: {
      displayName,
      passwordHash,
      role: "ADMIN",
      email,
      emailNormalized: email,
      emailVerifiedAt: new Date(),
    },
    create: {
      username,
      displayName,
      passwordHash,
      role: "ADMIN",
      email,
      emailNormalized: email,
      emailVerifiedAt: new Date(),
    },
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
