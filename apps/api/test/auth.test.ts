import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@compintel/db";

import { AuthService, hashPassword } from "../src/auth.js";
import { HttpError } from "../src/errors.js";

test("register hashes the password and creates a pending user", async () => {
  let passwordHash = "";
  const db = {
    user: {
      async create({ data }: { data: { passwordHash: string } }) {
        passwordHash = data.passwordHash;
        return databaseUser({
          passwordHash: data.passwordHash,
          approvalStatus: "PENDING",
        });
      },
    },
  } as unknown as PrismaClient;

  const user = await new AuthService(db).register({
    username: "member",
    displayName: "参赛者",
    password: "password123",
  });

  assert.match(passwordHash, /^scrypt\$16384\$8\$1\$/);
  assert.ok(!passwordHash.includes("password123"));
  assert.equal(user.approvalStatus, "PENDING");
});

test("pending users cannot create a session", async () => {
  const passwordHash = await hashPassword("password123");
  const db = {
    user: {
      async findUnique() {
        return databaseUser({ passwordHash, approvalStatus: "PENDING" });
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new AuthService(db).login({ username: "member", password: "password123" }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 403 &&
      error.code === "ACCOUNT_PENDING",
  );
});

test("approved users receive an opaque persisted session", async () => {
  const passwordHash = await hashPassword("password123");
  let storedTokenHash = "";
  const db = {
    user: {
      async findUnique() {
        return databaseUser({ passwordHash, approvalStatus: "APPROVED" });
      },
    },
    session: {
      async create({ data }: { data: { tokenHash: string } }) {
        storedTokenHash = data.tokenHash;
        return { id: "session-1" };
      },
    },
  } as unknown as PrismaClient;

  const session = await new AuthService(db).login({
    username: "member",
    password: "password123",
  });

  assert.equal(session.user.approvalStatus, "APPROVED");
  assert.match(session.token, /^[A-Za-z0-9_-]+$/);
  assert.equal(storedTokenHash.length, 64);
  assert.ok(!storedTokenHash.includes(session.token));
});

function databaseUser(overrides: {
  passwordHash: string;
  approvalStatus: "PENDING" | "APPROVED";
}) {
  return {
    id: "user-1",
    username: "member",
    displayName: "参赛者",
    passwordHash: overrides.passwordHash,
    role: "USER" as const,
    approvalStatus: overrides.approvalStatus,
    reviewedAt: null,
    reviewedById: null,
    createdAt: new Date("2026-07-13T08:00:00.000Z"),
    updatedAt: new Date("2026-07-13T08:00:00.000Z"),
  };
}
