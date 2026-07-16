import assert from "node:assert/strict";
import test from "node:test";

import {
  EMAIL_SEND_BLOCK_THRESHOLD,
  EMAIL_SEND_TURNSTILE_THRESHOLD,
  gateFromCount,
  MemoryEmailSendLimiter,
  RedisEmailSendLimiter,
} from "../src/email-send-limiter.js";

test("gateFromCount matches Turnstile and block thresholds", () => {
  assert.deepEqual(gateFromCount(EMAIL_SEND_TURNSTILE_THRESHOLD), {
    action: "allow",
  });
  assert.deepEqual(gateFromCount(EMAIL_SEND_TURNSTILE_THRESHOLD + 1), {
    action: "require_turnstile",
  });
  assert.deepEqual(gateFromCount(EMAIL_SEND_BLOCK_THRESHOLD), {
    action: "require_turnstile",
  });
  assert.deepEqual(gateFromCount(EMAIL_SEND_BLOCK_THRESHOLD + 1), {
    action: "block",
  });
});

test("MemoryEmailSendLimiter reserves atomically relative to prior slots", async () => {
  const limiter = new MemoryEmailSendLimiter();
  assert.deepEqual(await limiter.reserve("1.1.1.1"), { action: "allow" });
  assert.equal(limiter.getCount("1.1.1.1"), 1);

  limiter.setCount("1.1.1.1", EMAIL_SEND_TURNSTILE_THRESHOLD);
  assert.deepEqual(await limiter.reserve("1.1.1.1"), {
    action: "require_turnstile",
  });
  assert.equal(limiter.getCount("1.1.1.1"), EMAIL_SEND_TURNSTILE_THRESHOLD + 1);

  limiter.setCount("1.1.1.1", EMAIL_SEND_BLOCK_THRESHOLD);
  assert.deepEqual(await limiter.reserve("1.1.1.1"), { action: "block" });
  assert.equal(limiter.getCount("1.1.1.1"), EMAIL_SEND_BLOCK_THRESHOLD + 1);
});

test("MemoryEmailSendLimiter release rolls back without going negative", async () => {
  const limiter = new MemoryEmailSendLimiter();
  await limiter.reserve("2.2.2.2");
  await limiter.reserve("2.2.2.2");
  assert.equal(limiter.getCount("2.2.2.2"), 2);

  await limiter.release("2.2.2.2");
  assert.equal(limiter.getCount("2.2.2.2"), 1);

  await limiter.release("2.2.2.2");
  assert.equal(limiter.getCount("2.2.2.2"), 0);

  await limiter.release("2.2.2.2");
  assert.equal(limiter.getCount("2.2.2.2"), 0);
});

test("concurrent MemoryEmailSendLimiter reserves cannot all stay under Turnstile", async () => {
  const limiter = new MemoryEmailSendLimiter();
  const ip = "198.51.100.7";
  const burst = EMAIL_SEND_TURNSTILE_THRESHOLD + 3;

  const gates = await Promise.all(
    Array.from({ length: burst }, () => limiter.reserve(ip)),
  );

  assert.equal(limiter.getCount(ip), burst);
  const allowCount = gates.filter((g) => g.action === "allow").length;
  const turnstileCount = gates.filter(
    (g) => g.action === "require_turnstile",
  ).length;
  assert.equal(allowCount, EMAIL_SEND_TURNSTILE_THRESHOLD);
  assert.equal(turnstileCount, burst - EMAIL_SEND_TURNSTILE_THRESHOLD);
});

test("RedisEmailSendLimiter reserve and release use Lua INCR/DECR", async () => {
  const evalCalls: Array<{
    script: string;
    numKeys: number;
    key: string;
    arg?: string;
  }> = [];
  let stored = 0;

  const redis = {
    async eval(
      script: string,
      numKeys: number,
      key: string,
      arg?: string,
    ): Promise<number> {
      evalCalls.push({ script, numKeys, key, arg });
      if (script.includes("INCR")) {
        stored += 1;
        return stored;
      }
      if (stored <= 1) {
        stored = 0;
        return 0;
      }
      stored -= 1;
      return stored;
    },
  };

  const limiter = new RedisEmailSendLimiter(redis as never, "email-send:ip:");

  assert.deepEqual(await limiter.reserve("203.0.113.9"), { action: "allow" });
  assert.equal(evalCalls[0]?.numKeys, 1);
  assert.equal(evalCalls[0]?.key, "email-send:ip:203.0.113.9");
  assert.ok(evalCalls[0]?.script.includes("INCR"));
  assert.ok(evalCalls[0]?.script.includes("EXPIRE"));

  stored = EMAIL_SEND_TURNSTILE_THRESHOLD;
  assert.deepEqual(await limiter.reserve("203.0.113.9"), {
    action: "require_turnstile",
  });

  await limiter.release("203.0.113.9");
  assert.ok(
    evalCalls.at(-1)?.script.includes("DECR") ||
      evalCalls.at(-1)?.script.includes("DEL"),
  );
  assert.equal(stored, EMAIL_SEND_TURNSTILE_THRESHOLD);
});
