import assert from "node:assert/strict";
import test from "node:test";

import { resolveClientIp } from "../src/client-ip.js";

test("prefers CF-Connecting-IP over other headers", () => {
  assert.equal(
    resolveClientIp(
      {
        "cf-connecting-ip": "198.51.100.1",
        "x-real-ip": "203.0.113.1",
        "x-forwarded-for": "192.0.2.1, 203.0.113.2",
      },
      "127.0.0.1",
    ),
    "198.51.100.1",
  );
});

test("falls back through X-Real-IP and X-Forwarded-For", () => {
  assert.equal(
    resolveClientIp({ "X-Real-IP": "203.0.113.9" }, "127.0.0.1"),
    "203.0.113.9",
  );
  assert.equal(
    resolveClientIp(
      { "X-Forwarded-For": "192.0.2.44, 198.51.100.2" },
      "127.0.0.1",
    ),
    "192.0.2.44",
  );
  assert.equal(resolveClientIp({}, "10.0.0.8"), "10.0.0.8");
});
