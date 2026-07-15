import assert from "node:assert/strict";
import test from "node:test";

import {
  EmailPolicyError,
  parseAndNormalizeEmail,
} from "../src/email-policy.js";

const allowed = ["gmail", "qq", "163", "126"] as const;

test("normalizes gmail dots, plus tags, and googlemail domain", () => {
  const parsed = parseAndNormalizeEmail("A.B+test@GoogleMail.com", allowed);
  assert.equal(parsed.email, "a.b+test@gmail.com");
  assert.equal(parsed.emailNormalized, "ab@gmail.com");
  assert.equal(parsed.provider, "gmail");
});

test("treats gmail aliases as the same normalized address", () => {
  const left = parseAndNormalizeEmail("john.doe@gmail.com", allowed);
  const right = parseAndNormalizeEmail("johndoe+spam@gmail.com", allowed);
  assert.equal(left.emailNormalized, right.emailNormalized);
});

test("keeps qq local part without gmail-style folding", () => {
  const parsed = parseAndNormalizeEmail("user.name@qq.com", allowed);
  assert.equal(parsed.email, "user.name@qq.com");
  assert.equal(parsed.emailNormalized, "user.name@qq.com");
});

test("rejects providers outside the allowlist", () => {
  assert.throws(
    () => parseAndNormalizeEmail("user@outlook.com", allowed),
    (error: unknown) =>
      error instanceof EmailPolicyError &&
      error.code === "EMAIL_PROVIDER_NOT_ALLOWED",
  );
});

test("rejects invalid email shapes", () => {
  assert.throws(
    () => parseAndNormalizeEmail("not-an-email", allowed),
    (error: unknown) =>
      error instanceof EmailPolicyError && error.code === "EMAIL_INVALID",
  );
});
