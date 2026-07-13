import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@compintel/db";

import { buildApp } from "../src/app.js";
import type { SubmissionService } from "../src/submissions.js";

const unusedDependencies = {
  db: {} as PrismaClient,
  submissions: {} as SubmissionService,
};

test("health endpoint is available without authentication", async () => {
  const app = buildApp(unusedDependencies);
  const response = await app.inject({ method: "GET", url: "/health" });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("player submission requires an identity", async () => {
  const app = buildApp(unusedDependencies);
  const response = await app.inject({
    method: "POST",
    url: "/v1/games/gomoku/players",
    payload: { name: "bot", sourceCode: "int main() {}" },
  });
  await app.close();

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "AUTH_REQUIRED");
});
