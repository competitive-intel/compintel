import assert from "node:assert/strict";
import test from "node:test";
import { Writable } from "node:stream";

import { createLogger } from "../src/index.js";

class LogSink extends Writable {
  readonly entries: string[] = [];

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.entries.push(chunk.toString());
    callback();
  }

  json(index = 0): Record<string, unknown> {
    const entry = this.entries[index];
    assert.notEqual(entry, undefined);
    return JSON.parse(entry ?? "") as Record<string, unknown>;
  }
}

test("writes structured service context and serializes errors", () => {
  const sink = new LogSink();
  const logger = createLogger({
    service: "test-service",
    environment: "test",
    destination: sink,
  });

  logger.error({ err: new Error("failure"), evaluationId: "eval-1" }, "failed");

  const entry = sink.json();
  assert.equal(entry.service, "test-service");
  assert.equal(entry.environment, "test");
  assert.equal(entry.evaluationId, "eval-1");
  assert.equal(entry.msg, "failed");
  assert.equal(typeof entry.time, "string");
  assert.equal((entry.err as Record<string, unknown>).message, "failure");
  assert.equal(typeof (entry.err as Record<string, unknown>).stack, "string");
});

test("redacts credentials, verification data, cookies, and source code", () => {
  const sink = new LogSink();
  const logger = createLogger({ service: "test-service", destination: sink });

  logger.info(
    {
      req: {
        headers: {
          authorization: "Bearer secret",
          cookie: "compintel_session=secret",
        },
      },
      input: {
        password: "plain-password-value",
        turnstileToken: "captcha-token",
        code: "123456",
        sourceCode: "int main() {}",
      },
      session: { token: "session-token" },
    },
    "sensitive fields",
  );

  const serialized = sink.entries.join("");
  for (const secret of [
    "Bearer secret",
    "compintel_session=secret",
    "plain-password-value",
    "captcha-token",
    "123456",
    "int main() {}",
    "session-token",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.match(serialized, /\[Redacted\]/u);
});

test("preserves diagnostic error codes", () => {
  const sink = new LogSink();
  const logger = createLogger({ service: "test-service", destination: sink });
  const error = Object.assign(new Error("connection failed"), {
    code: "ECONNREFUSED",
  });

  logger.error({ err: error }, "request failed");

  assert.equal(
    (sink.json().err as Record<string, unknown>).code,
    "ECONNREFUSED",
  );
});

test("honors the configured log level", () => {
  const sink = new LogSink();
  const logger = createLogger({
    service: "test-service",
    level: "warn",
    destination: sink,
  });

  logger.info("hidden");
  logger.warn("visible");

  assert.equal(sink.entries.length, 1);
  assert.equal(sink.json().msg, "visible");
});
