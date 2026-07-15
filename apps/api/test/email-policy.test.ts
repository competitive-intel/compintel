import assert from "node:assert/strict";
import test from "node:test";

import {
  EmailPolicyError,
  parseAndNormalizeEmail,
} from "../src/email-policy.js";

const allowed = ["gmail.com", "qq.com", "163.com", "126.com"] as const;
const legacyAllowed = ["gmail", "qq", "163", "126"] as const;

test("normalizes gmail dots, plus tags, and googlemail domain", () => {
  const parsed = parseAndNormalizeEmail("A.B+test@GoogleMail.com", allowed);
  assert.equal(parsed.email, "a.b+test@gmail.com");
  assert.equal(parsed.emailNormalized, "ab@gmail.com");
  assert.equal(parsed.provider, "gmail.com");
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

test("allows provider subdomains via suffix match", () => {
  const parsed = parseAndNormalizeEmail("user@vip.163.com", allowed);
  assert.equal(parsed.email, "user@vip.163.com");
  assert.equal(parsed.provider, "163.com");
});

test("rejects lookalike domains that only share a first label", () => {
  assert.throws(
    () => parseAndNormalizeEmail("user@gmail.com.evil.com", allowed),
    (error: unknown) =>
      error instanceof EmailPolicyError &&
      error.code === "EMAIL_PROVIDER_NOT_ALLOWED",
  );
  assert.throws(
    () => parseAndNormalizeEmail("user@vip.example.com", allowed),
    (error: unknown) =>
      error instanceof EmailPolicyError &&
      error.code === "EMAIL_PROVIDER_NOT_ALLOWED",
  );
});

test("expands legacy short allowlist entries", () => {
  const parsed = parseAndNormalizeEmail("user@vip.163.com", legacyAllowed);
  assert.equal(parsed.provider, "163.com");
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
