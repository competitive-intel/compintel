import assert from "node:assert/strict";
import test from "node:test";

import type { CurrentUser } from "@compintel/contracts";
import type { PrismaClient } from "@compintel/db";

import { buildApp } from "../src/app.js";
import type { AuthService } from "../src/auth.js";
import type { BuiltinPlayerService } from "../src/builtin-players.js";
import type { EvaluationRecordService } from "../src/evaluation-records.js";
import type { GameService } from "../src/games.js";
import type { SubmissionService } from "../src/submissions.js";

const unusedDependencies = {
  db: {} as PrismaClient,
  submissions: {} as SubmissionService,
  auth: { authenticate: async () => null } as unknown as AuthService,
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

test("does not expose a second player-version submission endpoint", async () => {
  const app = buildApp(unusedDependencies);
  const response = await app.inject({
    method: "POST",
    url: "/v1/players/player-1/versions",
    payload: { sourceCode: "int main() {}" },
  });
  await app.close();

  assert.equal(response.statusCode, 404);
});

test("approved users can list their player names for autocomplete", async () => {
  let requested: { userId: string; gameSlug: string } | null = null;
  const submissions = {
    async listPlayerNames(userId: string, gameSlug: string) {
      requested = { userId, gameSlug };
      return ["alpha", "beta"];
    },
  } as unknown as SubmissionService;
  const app = buildApp({
    ...unusedDependencies,
    auth: approvedAuth(),
    submissions,
  });
  const response = await app.inject({
    method: "GET",
    url: "/v1/games/gomoku/players",
    headers: { cookie: "compintel_session=session-token" },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(requested, { userId: "user-1", gameSlug: "gomoku" });
  assert.deepEqual(response.json(), { names: ["alpha", "beta"] });
});

test("registration creates a pending account", async () => {
  let registeredUsername = "";
  const auth = {
    async register(input: { username: string }) {
      registeredUsername = input.username;
      return userFixture({ approvalStatus: "PENDING" });
    },
  } as unknown as AuthService;
  const app = buildApp({ ...unusedDependencies, auth });
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      username: "New_User",
      displayName: "新用户",
      password: "password123",
    },
  });
  await app.close();

  assert.equal(response.statusCode, 201);
  assert.equal(registeredUsername, "new_user");
  assert.equal(response.json().user.approvalStatus, "PENDING");
});

test("login sets an HttpOnly session cookie", async () => {
  const auth = {
    async login() {
      return {
        token: "secret-session-token",
        expiresAt: new Date("2026-07-20T08:00:00.000Z"),
        user: userFixture(),
      };
    },
  } as unknown as AuthService;
  const app = buildApp({ ...unusedDependencies, auth });
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { username: "member", password: "password123" },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["set-cookie"] ?? "", /HttpOnly/);
  assert.match(response.headers["set-cookie"] ?? "", /SameSite=Lax/);
  assert.match(response.headers["set-cookie"] ?? "", /secret-session-token/);
});

test("ordinary users cannot access the review queue", async () => {
  const auth = {
    async authenticate() {
      return userFixture();
    },
  } as unknown as AuthService;
  const app = buildApp({ ...unusedDependencies, auth });
  const response = await app.inject({
    method: "GET",
    url: "/v1/admin/users",
    headers: { cookie: "compintel_session=session-token" },
  });
  await app.close();

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, "ADMIN_REQUIRED");
});

test("game catalog requires an approved session", async () => {
  const app = buildApp(unusedDependencies);
  const response = await app.inject({ method: "GET", url: "/v1/games" });
  await app.close();

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "AUTH_REQUIRED");
});

test("approved users can list published games", async () => {
  const games = {
    async listPublished() {
      return [gameSummaryFixture()];
    },
  } as unknown as GameService;
  const app = buildApp({ ...unusedDependencies, auth: approvedAuth(), games });
  const response = await app.inject({
    method: "GET",
    url: "/v1/games",
    headers: { cookie: "compintel_session=session-token" },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().games, [gameSummaryFixture()]);
});

test("administrators can update a game catalog entry", async () => {
  let update: { id: string; name?: string } | null = null;
  const games = {
    async update(id: string, input: { name?: string }) {
      update = { id, ...input };
      return adminGameFixture({ name: input.name ?? "五子棋" });
    },
  } as unknown as GameService;
  const auth = {
    async authenticate() {
      return userFixture({ role: "ADMIN" });
    },
  } as unknown as AuthService;
  const app = buildApp({ ...unusedDependencies, auth, games });
  const response = await app.inject({
    method: "PATCH",
    url: "/v1/admin/games/game-1",
    headers: { cookie: "compintel_session=admin-session" },
    payload: { name: "标准五子棋" },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(update, { id: "game-1", name: "标准五子棋" });
  assert.equal(response.json().name, "标准五子棋");
});

test("game creation is not exposed as an administration API", async () => {
  const auth = {
    async authenticate() {
      return userFixture({ role: "ADMIN" });
    },
  } as unknown as AuthService;
  const app = buildApp({ ...unusedDependencies, auth });
  const response = await app.inject({
    method: "POST",
    url: "/v1/admin/games",
    headers: { cookie: "compintel_session=admin-session" },
    payload: {
      slug: "connect-four",
      name: "四子棋",
    },
  });
  await app.close();

  assert.equal(response.statusCode, 404);
});

test("administrators can create a database-backed built-in program", async () => {
  let created: {
    gameId: string;
    name: string;
    sourceCode: string;
    isActive: boolean;
  } | null = null;
  const builtinPlayers = {
    async create(
      gameId: string,
      input: { name: string; sourceCode: string; isActive: boolean },
    ) {
      created = { gameId, ...input };
      return builtinPlayerFixture();
    },
  } as unknown as BuiltinPlayerService;
  const auth = {
    async authenticate() {
      return userFixture({ role: "ADMIN" });
    },
  } as unknown as AuthService;
  const app = buildApp({
    ...unusedDependencies,
    auth,
    builtinPlayers,
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/admin/games/game-1/builtin-players",
    headers: { cookie: "compintel_session=admin-session" },
    payload: { name: "基准程序", sourceCode: "int main() {}" },
  });
  await app.close();

  assert.equal(response.statusCode, 201);
  assert.deepEqual(created, {
    gameId: "game-1",
    name: "基准程序",
    sourceCode: "int main() {}",
    isActive: true,
    weight: 1,
  });
  assert.equal(response.json().latestVersion.language, "CPP");
});

test("administrators can approve a pending user", async () => {
  let reviewed: {
    administratorId: string;
    userId: string;
    decision: string;
  } | null = null;
  const auth = {
    async authenticate() {
      return userFixture({ id: "admin-1", role: "ADMIN" });
    },
    async reviewUser(
      administratorId: string,
      userId: string,
      input: { decision: string },
    ) {
      reviewed = { administratorId, userId, decision: input.decision };
      return {
        ...userFixture({ id: userId }),
        reviewedAt: "2026-07-13T09:00:00.000Z",
        reviewedBy: { id: administratorId, displayName: "平台管理员" },
      };
    },
  } as unknown as AuthService;
  const app = buildApp({ ...unusedDependencies, auth });
  const response = await app.inject({
    method: "POST",
    url: "/v1/admin/users/user-2/review",
    headers: { cookie: "compintel_session=admin-session" },
    payload: { decision: "APPROVE" },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(reviewed, {
    administratorId: "admin-1",
    userId: "user-2",
    decision: "APPROVE",
  });
});

test("approved users can list public submissions for a game", async () => {
  let requested: { gameSlug: string; page: number; pageSize: number } | null =
    null;
  const evaluationRecords = {
    async listForGame(
      gameSlug: string,
      input: { page: number; pageSize: number },
    ) {
      requested = { gameSlug, ...input };
      return {
        submissions: [submissionRecordFixture()],
        page: input.page,
        pageSize: input.pageSize,
        total: 1,
      };
    },
  } as unknown as EvaluationRecordService;
  const app = buildApp({
    ...unusedDependencies,
    auth: approvedAuth(),
    evaluationRecords,
  });
  const response = await app.inject({
    method: "GET",
    url: "/v1/games/gomoku/submissions?page=2&pageSize=10",
    headers: { cookie: "compintel_session=session-token" },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(requested, { gameSlug: "gomoku", page: 2, pageSize: 10 });
  assert.equal(response.json().submissions[0].author.username, "other-user");
});

test("approved users can inspect another user's source and evaluation results", async () => {
  const evaluationRecords = {
    async getDetail() {
      return submissionDetailFixture();
    },
  } as unknown as EvaluationRecordService;
  const app = buildApp({
    ...unusedDependencies,
    auth: approvedAuth(),
    evaluationRecords,
  });
  const response = await app.inject({
    method: "GET",
    url: "/v1/submissions/player-version-1",
    headers: { cookie: "compintel_session=session-token" },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().sourceCode, "int main() {}");
  assert.equal(response.json().author.username, "other-user");
  assert.equal(response.json().evaluations[0].opponentName, "基准程序");
});

function submissionRecordFixture() {
  return {
    id: "player-version-1",
    playerId: "player-1",
    playerName: "other-bot",
    version: 1,
    language: "CPP" as const,
    author: {
      id: "user-2",
      username: "other-user",
      displayName: "其他用户",
    },
    status: "FINISHED" as const,
    evaluationSummary: { total: 1, finished: 1, won: 1 },
    score: 100,
    createdAt: "2026-07-13T08:00:00.000Z",
  };
}

function submissionDetailFixture() {
  return {
    ...submissionRecordFixture(),
    game: { slug: "gomoku", name: "五子棋", rulesVersion: "gomoku-v1" },
    sourceCode: "int main() {}",
    sourceSha256:
      "00096d96da5299e65479678a8e79b07ab36e6185120e892a1360e1be25e84fbb",
    evaluations: [
      {
        id: "evaluation-1",
        opponentVersionId: "opponent-version-1",
        opponentName: "基准程序",
        opponentVersion: 1,
        opponentWeight: 1,
        won: true,
        status: "FINISHED" as const,
        verdict: "ACCEPTED" as const,
        compileStatus: "Accepted",
        compileLog: "",
        runStatus: "Accepted",
        stdout: "7 7\n",
        stderr: "",
        cpuTimeNs: "1000000",
        wallTimeNs: "2000000",
        memoryBytes: "1048576",
        errorMessage: null,
        replay: null,
        createdAt: "2026-07-13T08:00:00.000Z",
        startedAt: "2026-07-13T08:00:01.000Z",
        finishedAt: "2026-07-13T08:00:02.000Z",
      },
    ],
  };
}

function approvedAuth(): AuthService {
  return {
    async authenticate() {
      return userFixture();
    },
  } as unknown as AuthService;
}

function userFixture(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return { ...baseUserFixture(), ...overrides };
}

function baseUserFixture(): CurrentUser {
  return {
    id: "user-1",
    username: "member",
    displayName: "参赛者",
    role: "USER" as const,
    approvalStatus: "APPROVED" as const,
    createdAt: "2026-07-13T08:00:00.000Z",
  };
}

function gameSummaryFixture() {
  return {
    id: "game-1",
    slug: "gomoku",
    name: "五子棋",
    summary: "在棋盘上率先连成五子。",
    rulesVersion: "gomoku-v1",
    resourceLimits: {
      moveCpuLimitMs: 100,
      totalCpuLimitMs: 5_000,
      memoryLimitMiB: 256,
    },
  };
}

function adminGameFixture(overrides: { name?: string } = {}) {
  return {
    ...gameSummaryFixture(),
    description: "经典双人棋类游戏。",
    rulesMarkdown:
      "## 基本规则\n\n双方轮流落子。\n\n## 通信协议\n\n通过标准输入输出通信。",
    isPublished: true,
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-13T09:00:00.000Z",
    ...overrides,
  };
}

function builtinPlayerFixture() {
  return {
    id: "builtin-1",
    gameId: "game-1",
    name: "基准程序",
    isActive: true,
    weight: 1,
    versionCount: 1,
    latestVersion: {
      id: "builtin-version-1",
      version: 1,
      language: "CPP" as const,
      sourceCode: "int main() {}",
      sourceSha256:
        "00096d96da5299e65479678a8e79b07ab36e6185120e892a1360e1be25e84fbb",
      createdAt: "2026-07-13T08:00:00.000Z",
    },
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-13T09:00:00.000Z",
  };
}
