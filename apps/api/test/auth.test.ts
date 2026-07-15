import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { PrismaClient } from "@compintel/db";

import { AuthService, hashPassword } from "../src/auth.js";
import { HttpError } from "../src/errors.js";
import type { SesClient } from "../src/ses-client.js";
import { SystemSettingsService } from "../src/system-settings.js";

test("register hashes the password and creates a pending unverified user", async () => {
  let passwordHash = "";
  let createdEmail = "";
  let createdNormalized = "";
  let storedCodeHash = "";
  let sentCode = "";
  const ses: SesClient = {
    async sendVerificationEmail(input) {
      sentCode = input.verifyCode;
    },
  };
  const db = {
    async $transaction(callback: (tx: unknown) => Promise<unknown>) {
      return callback(db);
    },
    user: {
      async create({
        data,
      }: {
        data: {
          passwordHash: string;
          email: string;
          emailNormalized: string;
          username: string;
          displayName: string;
        };
      }) {
        passwordHash = data.passwordHash;
        createdEmail = data.email;
        createdNormalized = data.emailNormalized;
        return databaseUser({
          passwordHash: data.passwordHash,
          email: data.email,
          emailNormalized: data.emailNormalized,
          emailVerifiedAt: null,
          approvalStatus: "PENDING",
        });
      },
    },
    emailVerification: {
      async create({ data }: { data: { codeHash: string } }) {
        storedCodeHash = data.codeHash;
        return data;
      },
    },
    systemSettings: {
      async upsert() {
        return configuredSettings();
      },
    },
  } as unknown as PrismaClient;

  const user = await new AuthService(db, { ses }).register({
    username: "member",
    displayName: "参赛者",
    email: "Member.Name+tag@gmail.com",
    password: "password123",
  });

  assert.match(passwordHash, /^scrypt\$16384\$8\$1\$/);
  assert.ok(!passwordHash.includes("password123"));
  assert.equal(user.approvalStatus, "PENDING");
  assert.equal(user.emailVerified, false);
  assert.equal(createdEmail, "member.name+tag@gmail.com");
  assert.equal(createdNormalized, "membername@gmail.com");
  assert.equal(sentCode.length, 6);
  assert.equal(
    storedCodeHash,
    createHash("sha256").update(sentCode).digest("hex"),
  );
});

test("unverified users cannot create a session", async () => {
  const passwordHash = await hashPassword("password123");
  const db = {
    user: {
      async findUnique() {
        return databaseUser({
          passwordHash,
          emailVerifiedAt: null,
          approvalStatus: "APPROVED",
        });
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new AuthService(db).login({ username: "member", password: "password123" }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 403 &&
      error.code === "EMAIL_UNVERIFIED",
  );
});

test("pending users cannot create a session after email verification", async () => {
  const passwordHash = await hashPassword("password123");
  const db = {
    user: {
      async findUnique() {
        return databaseUser({
          passwordHash,
          emailVerifiedAt: new Date("2026-07-15T08:00:00.000Z"),
          approvalStatus: "PENDING",
        });
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

test("approved verified users receive an opaque persisted session", async () => {
  const passwordHash = await hashPassword("password123");
  let storedTokenHash = "";
  const db = {
    user: {
      async findUnique() {
        return databaseUser({
          passwordHash,
          emailVerifiedAt: new Date("2026-07-15T08:00:00.000Z"),
          approvalStatus: "APPROVED",
        });
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
  assert.equal(session.user.emailVerified, true);
  assert.match(session.token, /^[A-Za-z0-9_-]+$/);
  assert.equal(storedTokenHash.length, 64);
  assert.ok(!storedTokenHash.includes(session.token));
});

test("verifyEmail accepts a valid code and clears the challenge", async () => {
  const code = "123456";
  const codeHash = createHash("sha256").update(code).digest("hex");
  let deleted = false;
  const db = {
    async $transaction(callback: (tx: unknown) => Promise<unknown>) {
      return callback(db);
    },
    user: {
      async findUnique() {
        return {
          ...databaseUser({
            passwordHash: "hash",
            emailVerifiedAt: null,
            approvalStatus: "PENDING",
          }),
          emailVerification: {
            codeHash,
            expiresAt: new Date("2026-07-15T09:00:00.000Z"),
            attemptCount: 0,
            sentAt: new Date("2026-07-15T08:00:00.000Z"),
          },
        };
      },
      async update({ data }: { data: { emailVerifiedAt: Date } }) {
        return databaseUser({
          passwordHash: "hash",
          emailVerifiedAt: data.emailVerifiedAt,
          approvalStatus: "PENDING",
        });
      },
    },
    emailVerification: {
      async delete() {
        deleted = true;
        return {};
      },
    },
  } as unknown as PrismaClient;

  const user = await new AuthService(db, {
    now: () => new Date("2026-07-15T08:30:00.000Z"),
  }).verifyEmail({ username: "member", code });

  assert.equal(user.emailVerified, true);
  assert.equal(deleted, true);
});

test("verifyEmail rejects expired codes", async () => {
  const code = "123456";
  const codeHash = createHash("sha256").update(code).digest("hex");
  const db = {
    user: {
      async findUnique() {
        return {
          ...databaseUser({
            passwordHash: "hash",
            emailVerifiedAt: null,
            approvalStatus: "PENDING",
          }),
          emailVerification: {
            codeHash,
            expiresAt: new Date("2026-07-15T08:10:00.000Z"),
            attemptCount: 0,
            sentAt: new Date("2026-07-15T08:00:00.000Z"),
          },
        };
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new AuthService(db, {
      now: () => new Date("2026-07-15T08:30:00.000Z"),
    }).verifyEmail({ username: "member", code }),
    (error: unknown) =>
      error instanceof HttpError && error.code === "VERIFICATION_EXPIRED",
  );
});

test("resendVerification enforces a cooldown window", async () => {
  const db = {
    user: {
      async findUnique() {
        return {
          ...databaseUser({
            passwordHash: "hash",
            emailVerifiedAt: null,
            approvalStatus: "PENDING",
          }),
          emailVerification: {
            codeHash: "x",
            expiresAt: new Date("2026-07-15T09:00:00.000Z"),
            attemptCount: 0,
            sentAt: new Date("2026-07-15T08:00:00.000Z"),
          },
        };
      },
    },
    systemSettings: {
      async upsert() {
        return configuredSettings();
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new AuthService(db, {
      now: () => new Date("2026-07-15T08:00:30.000Z"),
    }).resendVerification({ username: "member" }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "VERIFICATION_RESEND_COOLDOWN",
  );
});

test("register fails when SES is not configured", async () => {
  const db = {
    systemSettings: {
      async upsert() {
        return {
          id: "default",
          tencentSesSecretId: "",
          tencentSesSecretKey: "",
          tencentSesFromAddress: "",
          tencentSesTemplateId: 0,
          allowedEmailProviders: ["gmail"],
          updatedAt: new Date(),
          updatedById: null,
        };
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new AuthService(db).register({
      username: "member",
      displayName: "参赛者",
      email: "member@gmail.com",
      password: "password123",
    }),
    (error: unknown) =>
      error instanceof HttpError && error.code === "SES_NOT_CONFIGURED",
  );
});

test("SystemSettings masks secret key and preserves it when omitted", async () => {
  let storedKey = "secret-key";
  const db = {
    systemSettings: {
      async upsert() {
        return {
          id: "default",
          tencentSesSecretId: "aki",
          tencentSesSecretKey: storedKey,
          tencentSesFromAddress: "noreply@mail.example.com",
          tencentSesTemplateId: 121_332,
          allowedEmailProviders: ["gmail", "qq"],
          updatedAt: new Date("2026-07-15T08:00:00.000Z"),
          updatedById: null,
        };
      },
      async update({
        data,
      }: {
        data: {
          tencentSesSecretId?: string;
          tencentSesSecretKey?: string;
          tencentSesTemplateId?: number;
          allowedEmailProviders?: string[];
        };
      }) {
        if (data.tencentSesSecretKey !== undefined) {
          storedKey = data.tencentSesSecretKey;
        }
        return {
          id: "default",
          tencentSesSecretId: data.tencentSesSecretId ?? "aki",
          tencentSesSecretKey: storedKey,
          tencentSesFromAddress: "noreply@mail.example.com",
          tencentSesTemplateId: data.tencentSesTemplateId ?? 121_332,
          allowedEmailProviders: data.allowedEmailProviders ?? ["gmail", "qq"],
          updatedAt: new Date("2026-07-15T09:00:00.000Z"),
          updatedById: "admin-1",
        };
      },
    },
  } as unknown as PrismaClient;

  const service = new SystemSettingsService(db);
  const current = await service.get();
  assert.equal(current.tencentSesSecretKeyConfigured, true);
  assert.equal("tencentSesSecretKey" in current, false);

  const updated = await service.update("admin-1", {
    tencentSesSecretId: "aki-2",
    allowedEmailProviders: ["gmail", "163"],
  });
  assert.equal(updated.tencentSesSecretId, "aki-2");
  assert.equal(updated.tencentSesSecretKeyConfigured, true);
  assert.deepEqual(updated.allowedEmailProviders, ["gmail", "163"]);
  assert.equal(storedKey, "secret-key");
});

function configuredSettings() {
  return {
    id: "default",
    tencentSesSecretId: "aki",
    tencentSesSecretKey: "secret",
    tencentSesFromAddress: "CompIntel <noreply@mail.example.com>",
    tencentSesTemplateId: 121_332,
    allowedEmailProviders: ["gmail", "qq", "163", "126"],
    updatedAt: new Date("2026-07-15T08:00:00.000Z"),
    updatedById: null,
  };
}

function databaseUser(overrides: {
  passwordHash: string;
  email?: string;
  emailNormalized?: string;
  emailVerifiedAt: Date | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
}) {
  return {
    id: "user-1",
    username: "member",
    displayName: "参赛者",
    email: overrides.email ?? "member@gmail.com",
    emailNormalized: overrides.emailNormalized ?? "member@gmail.com",
    emailVerifiedAt: overrides.emailVerifiedAt,
    passwordHash: overrides.passwordHash,
    role: "USER" as const,
    approvalStatus: overrides.approvalStatus,
    reviewedAt: null,
    reviewedById: null,
    createdAt: new Date("2026-07-13T08:00:00.000Z"),
    updatedAt: new Date("2026-07-13T08:00:00.000Z"),
  };
}
