import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { PrismaClient } from "@compintel/db";

import { AuthService, hashPassword } from "../src/auth.js";
import { MemoryEmailSendLimiter } from "../src/email-send-limiter.js";
import { HttpError } from "../src/errors.js";
import type { SesClient } from "../src/ses-client.js";
import { SystemSettingsService } from "../src/system-settings.js";

const mailContext = { clientIp: "203.0.113.10" };

function mailSettings(db: PrismaClient): SystemSettingsService {
  return new SystemSettingsService(db, {
    tencentSesSecretId: "aki",
    tencentSesSecretKey: "secret",
  });
}

test("register hashes the password and creates an unverified user", async () => {
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
    user: {
      async findMany() {
        return [];
      },
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
    async $transaction(callback: (tx: unknown) => Promise<unknown>) {
      return callback(db);
    },
  } as unknown as PrismaClient;

  const user = await new AuthService(db, {
    ses,
    settings: mailSettings(db),
  }).register(
    {
      username: "member",
      displayName: "参赛者",
      email: "Member.Name+tag@gmail.com",
      password: "password123",
    },
    mailContext,
  );

  assert.match(passwordHash, /^scrypt\$16384\$8\$1\$/);
  assert.ok(!passwordHash.includes("password123"));
  assert.equal(user.role, "USER");
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

test("banned users cannot create a session", async () => {
  const passwordHash = await hashPassword("password123");
  const db = {
    user: {
      async findUnique() {
        return databaseUser({
          passwordHash,
          emailVerifiedAt: new Date("2026-07-15T08:00:00.000Z"),
          role: "BANNED",
        });
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new AuthService(db).login({ username: "member", password: "password123" }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 403 &&
      error.code === "ACCOUNT_BANNED",
  );
});

test("verified users receive an opaque persisted session", async () => {
  const passwordHash = await hashPassword("password123");
  let storedTokenHash = "";
  const db = {
    user: {
      async findUnique() {
        return databaseUser({
          passwordHash,
          emailVerifiedAt: new Date("2026-07-15T08:00:00.000Z"),
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

  assert.equal(session.user.role, "USER");
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

  const result = await new AuthService(db, {
    now: () => new Date("2026-07-15T08:30:00.000Z"),
  }).verifyEmail({ username: "member", code });

  assert.ok("user" in result);
  assert.equal(result.user.emailVerified, true);
  assert.equal(deleted, true);
});

test("verifyEmail returns ok without PII when already verified", async () => {
  const db = {
    user: {
      async findUnique() {
        return {
          ...databaseUser({
            passwordHash: "hash",
            emailVerifiedAt: new Date("2026-07-15T08:00:00.000Z"),
          }),
          emailVerification: null,
        };
      },
    },
  } as unknown as PrismaClient;

  const result = await new AuthService(db).verifyEmail({
    username: "member",
    code: "123456",
  });
  assert.deepEqual(result, { ok: true });
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
      settings: mailSettings(db),
      now: () => new Date("2026-07-15T08:00:30.000Z"),
    }).resendVerification({ username: "member" }, mailContext),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "VERIFICATION_RESEND_COOLDOWN",
  );
});

test("resendVerification keeps the old challenge when SES fails", async () => {
  let upserted = false;
  const ses: SesClient = {
    async sendVerificationEmail() {
      throw new Error("ses down");
    },
  };
  const db = {
    user: {
      async findUnique() {
        return {
          ...databaseUser({
            passwordHash: "hash",
            emailVerifiedAt: null,
          }),
          emailVerification: {
            codeHash: "old-hash",
            expiresAt: new Date("2026-07-15T09:00:00.000Z"),
            attemptCount: 2,
            sentAt: new Date("2026-07-15T07:00:00.000Z"),
          },
        };
      },
    },
    emailVerification: {
      async upsert() {
        upserted = true;
        return {};
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
      ses,
      settings: mailSettings(db),
      now: () => new Date("2026-07-15T08:30:00.000Z"),
    }).resendVerification({ username: "member" }, mailContext),
    (error: unknown) =>
      error instanceof HttpError && error.code === "EMAIL_SEND_FAILED",
  );
  assert.equal(upserted, false);
});

test("register requires Turnstile after the IP send threshold", async () => {
  const limiter = new MemoryEmailSendLimiter();
  limiter.setCount(mailContext.clientIp, 6);
  const db = {
    systemSettings: {
      async upsert() {
        return configuredSettings({
          turnstileSiteKey: "site",
          turnstileSecretKey: "secret",
        });
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new AuthService(db, {
      settings: mailSettings(db),
      emailSendLimiter: limiter,
    }).register(
      {
        username: "member",
        displayName: "参赛者",
        email: "member@gmail.com",
        password: "password123",
      },
      mailContext,
    ),
    (error: unknown) =>
      error instanceof HttpError && error.code === "TURNSTILE_REQUIRED",
  );
});

test("register blocks an IP after the hard send threshold", async () => {
  const limiter = new MemoryEmailSendLimiter();
  limiter.setCount(mailContext.clientIp, 11);
  const db = {
    systemSettings: {
      async upsert() {
        return configuredSettings();
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new AuthService(db, {
      settings: mailSettings(db),
      emailSendLimiter: limiter,
    }).register(
      {
        username: "member",
        displayName: "参赛者",
        email: "member@gmail.com",
        password: "password123",
      },
      mailContext,
    ),
    (error: unknown) =>
      error instanceof HttpError && error.code === "EMAIL_SEND_IP_BLOCKED",
  );
  // Gate rejection rolls the reservation back.
  assert.equal(limiter.getCount(mailContext.clientIp), 11);
});

test("register keeps the reservation after SES success and rolls back on failure", async () => {
  const limiter = new MemoryEmailSendLimiter();
  const sesOk: SesClient = {
    async sendVerificationEmail() {},
  };
  const sesFail: SesClient = {
    async sendVerificationEmail() {
      throw new Error("ses down");
    },
  };

  let deleted = false;
  const db = {
    user: {
      async findMany() {
        return [];
      },
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
        return {
          id: "user-1",
          username: data.username,
          displayName: data.displayName,
          email: data.email,
          emailNormalized: data.emailNormalized,
          passwordHash: data.passwordHash,
          role: "USER",
          emailVerifiedAt: null,
          createdAt: new Date(),
        };
      },
      async delete() {
        deleted = true;
        return { id: "user-1" };
      },
    },
    emailVerification: {
      async create() {
        return {};
      },
    },
    systemSettings: {
      async upsert() {
        return configuredSettings();
      },
    },
    async $transaction<T>(fn: (tx: typeof db) => Promise<T>) {
      return fn(db);
    },
  } as unknown as PrismaClient;

  const ok = await new AuthService(db, {
    settings: mailSettings(db),
    ses: sesOk,
    emailSendLimiter: limiter,
  }).register(
    {
      username: "member_ok",
      displayName: "参赛者",
      email: "member_ok@gmail.com",
      password: "password123",
    },
    mailContext,
  );
  assert.equal(ok.username, "member_ok");
  assert.equal(limiter.getCount(mailContext.clientIp), 1);

  await assert.rejects(
    new AuthService(db, {
      settings: mailSettings(db),
      ses: sesFail,
      emailSendLimiter: limiter,
    }).register(
      {
        username: "member_fail",
        displayName: "参赛者",
        email: "member_fail@gmail.com",
        password: "password123",
      },
      mailContext,
    ),
    (error: unknown) =>
      error instanceof HttpError && error.code === "EMAIL_SEND_FAILED",
  );
  assert.equal(deleted, true);
  assert.equal(limiter.getCount(mailContext.clientIp), 1);
});

test("register reclaims stale unverified username or email conflicts", async () => {
  let deletedIds: string[] = [];
  let created = false;
  const ses: SesClient = {
    async sendVerificationEmail() {},
  };
  const db = {
    user: {
      async findMany() {
        return [{ id: "stale-1" }];
      },
      async deleteMany({ where }: { where: { id: { in: string[] } } }) {
        deletedIds = where.id.in;
        return { count: deletedIds.length };
      },
      async create({
        data,
      }: {
        data: {
          passwordHash: string;
          email: string;
          emailNormalized: string;
        };
      }) {
        created = true;
        return databaseUser({
          passwordHash: data.passwordHash,
          email: data.email,
          emailNormalized: data.emailNormalized,
          emailVerifiedAt: null,
        });
      },
    },
    emailVerification: {
      async create() {
        return {};
      },
    },
    systemSettings: {
      async upsert() {
        return configuredSettings();
      },
    },
    async $transaction(callback: (tx: unknown) => Promise<unknown>) {
      return callback(db);
    },
  } as unknown as PrismaClient;

  await new AuthService(db, {
    ses,
    settings: mailSettings(db),
    now: () => new Date("2026-07-15T08:00:00.000Z"),
  }).register(
    {
      username: "member",
      displayName: "参赛者",
      email: "member@gmail.com",
      password: "password123",
    },
    mailContext,
  );

  assert.deepEqual(deletedIds, ["stale-1"]);
  assert.equal(created, true);
});

test("register fails when SES is not configured", async () => {
  const db = {
    systemSettings: {
      async upsert() {
        return {
          id: "default",
          tencentSesFromAddress: "",
          tencentSesTemplateId: 0,
          allowedEmailProviders: ["gmail.com"],
          turnstileSiteKey: "",
          turnstileSecretKey: "",
          updatedAt: new Date(),
          updatedById: null,
        };
      },
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    new AuthService(db).register(
      {
        username: "member",
        displayName: "参赛者",
        email: "member@gmail.com",
        password: "password123",
      },
      mailContext,
    ),
    (error: unknown) =>
      error instanceof HttpError && error.code === "SES_NOT_CONFIGURED",
  );
});

test("SystemSettings reports env SES credentials and masks Turnstile secret", async () => {
  let storedTurnstileKey = "turnstile-secret";
  const db = {
    systemSettings: {
      async upsert() {
        return {
          id: "default",
          tencentSesFromAddress: "noreply@mail.example.com",
          tencentSesTemplateId: 121_332,
          allowedEmailProviders: ["gmail.com", "qq.com"],
          turnstileSiteKey: "site-key",
          turnstileSecretKey: storedTurnstileKey,
          updatedAt: new Date("2026-07-15T08:00:00.000Z"),
          updatedById: null,
        };
      },
      async update({
        data,
      }: {
        data: {
          tencentSesTemplateId?: number;
          allowedEmailProviders?: string[];
          turnstileSiteKey?: string;
          turnstileSecretKey?: string;
        };
      }) {
        if (data.turnstileSecretKey !== undefined) {
          storedTurnstileKey = data.turnstileSecretKey;
        }
        return {
          id: "default",
          tencentSesFromAddress: "noreply@mail.example.com",
          tencentSesTemplateId: data.tencentSesTemplateId ?? 121_332,
          allowedEmailProviders: data.allowedEmailProviders ?? [
            "gmail.com",
            "qq.com",
          ],
          turnstileSiteKey: data.turnstileSiteKey ?? "site-key",
          turnstileSecretKey: storedTurnstileKey,
          updatedAt: new Date("2026-07-15T09:00:00.000Z"),
          updatedById: "admin-1",
        };
      },
    },
  } as unknown as PrismaClient;

  const service = new SystemSettingsService(db, {
    tencentSesSecretId: "aki",
    tencentSesSecretKey: "secret-key",
  });
  const current = await service.get();
  assert.equal(current.tencentSesCredentialsConfigured, true);
  assert.equal(current.turnstileSecretKeyConfigured, true);
  assert.equal(current.turnstileSiteKey, "site-key");
  assert.equal("tencentSesSecretKey" in current, false);
  assert.equal("turnstileSecretKey" in current, false);

  const updated = await service.update("admin-1", {
    allowedEmailProviders: ["gmail.com", "163.com"],
  });
  assert.equal(updated.tencentSesCredentialsConfigured, true);
  assert.deepEqual(updated.allowedEmailProviders, ["gmail.com", "163.com"]);
  assert.equal(storedTurnstileKey, "turnstile-secret");

  const unset = new SystemSettingsService(db);
  assert.equal((await unset.get()).tencentSesCredentialsConfigured, false);
});

function configuredSettings(
  overrides: {
    turnstileSiteKey?: string;
    turnstileSecretKey?: string;
  } = {},
) {
  return {
    id: "default",
    tencentSesFromAddress: "CompIntel <noreply@mail.example.com>",
    tencentSesTemplateId: 121_332,
    allowedEmailProviders: ["gmail.com", "qq.com", "163.com", "126.com"],
    turnstileSiteKey: overrides.turnstileSiteKey ?? "",
    turnstileSecretKey: overrides.turnstileSecretKey ?? "",
    updatedAt: new Date("2026-07-15T08:00:00.000Z"),
    updatedById: null,
  };
}

function databaseUser(overrides: {
  passwordHash: string;
  email?: string;
  emailNormalized?: string;
  emailVerifiedAt: Date | null;
  role?: "USER" | "BANNED" | "ADMIN";
}) {
  return {
    id: "user-1",
    username: "member",
    displayName: "参赛者",
    email: overrides.email ?? "member@gmail.com",
    emailNormalized: overrides.emailNormalized ?? "member@gmail.com",
    emailVerifiedAt: overrides.emailVerifiedAt,
    passwordHash: overrides.passwordHash,
    role: overrides.role ?? ("USER" as const),
    createdAt: new Date("2026-07-13T08:00:00.000Z"),
    updatedAt: new Date("2026-07-13T08:00:00.000Z"),
  };
}
