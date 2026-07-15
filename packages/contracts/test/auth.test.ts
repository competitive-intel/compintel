import assert from "node:assert/strict";
import test from "node:test";

import {
  registerSchema,
  reviewUserSchema,
  updateSystemSettingsSchema,
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

test("user review accepts only explicit decisions", () => {
  assert.equal(
    reviewUserSchema.safeParse({ decision: "APPROVE" }).success,
    true,
  );
  assert.equal(
    reviewUserSchema.safeParse({ decision: "DELETE" }).success,
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
