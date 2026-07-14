import assert from "node:assert/strict";
import test from "node:test";

import { registerSchema, reviewUserSchema } from "../src/index.js";

test("registration normalizes usernames and enforces password strength", () => {
  const input = registerSchema.parse({
    username: "New_User",
    displayName: "新用户",
    password: "password123",
  });
  assert.equal(input.username, "new_user");
  assert.equal(
    registerSchema.safeParse({ ...input, password: "onlyletters" }).success,
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
