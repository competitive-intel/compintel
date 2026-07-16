import assert from "node:assert/strict";
import test from "node:test";

import {
  adminUserSchema,
  registerSchema,
  updateSystemSettingsSchema,
  userRoleSchema,
  verifyEmailSchema,
} from "../src/index.js";

test("registration normalizes usernames and requires email", () => {
  const input = registerSchema.parse({
    username: "New_User",
    displayName: "新用户",
    email: "New.User@Gmail.com",
    password: "password123",
  });
  assert.equal(input.username, "new_user");
  assert.equal(input.email, "new.user@gmail.com");
  assert.equal(
    registerSchema.safeParse({
      username: "new_user",
      displayName: "新用户",
      password: "password123",
    }).success,
    false,
  );
  assert.equal(
    registerSchema.safeParse({
      ...input,
      password: "onlyletters",
    }).success,
    false,
  );
});

test("verify email schema accepts six-digit codes", () => {
  assert.equal(
    verifyEmailSchema.safeParse({ username: "Alice", code: "123456" }).success,
    true,
  );
  assert.equal(
    verifyEmailSchema.safeParse({ username: "alice", code: "12345" }).success,
    false,
  );
});

test("user role includes banned accounts", () => {
  assert.equal(userRoleSchema.safeParse("USER").success, true);
  assert.equal(userRoleSchema.safeParse("BANNED").success, true);
  assert.equal(userRoleSchema.safeParse("ADMIN").success, true);
  assert.equal(userRoleSchema.safeParse("PENDING").success, false);
});

test("admin user includes submission count", () => {
  const parsed = adminUserSchema.parse({
    id: "u1",
    username: "alice",
    displayName: "Alice",
    email: "alice@gmail.com",
    emailVerified: true,
    role: "USER",
    createdAt: "2026-07-16T00:00:00.000Z",
    submissionCount: 3,
  });
  assert.equal(parsed.submissionCount, 3);
  assert.equal(
    adminUserSchema.safeParse({
      id: "u1",
      username: "alice",
      displayName: "Alice",
      email: "alice@gmail.com",
      emailVerified: true,
      role: "USER",
      createdAt: "2026-07-16T00:00:00.000Z",
    }).success,
    false,
  );
});

test("system settings update requires at least one field", () => {
  assert.equal(updateSystemSettingsSchema.safeParse({}).success, false);
  assert.equal(
    updateSystemSettingsSchema.safeParse({
      allowedEmailProviders: ["gmail.com", "qq.com"],
    }).success,
    true,
  );
  assert.equal(
    updateSystemSettingsSchema.safeParse({
      turnstileSiteKey: "site-key",
    }).success,
    true,
  );
  const secretKeyResult = updateSystemSettingsSchema.safeParse({
    turnstileSecretKey: "  secret-key  ",
  });
  assert.equal(secretKeyResult.success, true);
  if (secretKeyResult.success) {
    assert.equal(secretKeyResult.data.turnstileSecretKey, "secret-key");
  }
});
