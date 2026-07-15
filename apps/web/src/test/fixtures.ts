import type {
  AdminBuiltinPlayer,
  AdminGame,
  AdminUser,
  CurrentUser,
  Evaluation,
  GameDetail,
  GameSummary,
  GomokuReplay,
  SubmissionDetail,
  SubmissionRecord,
} from "@compintel/contracts";

const createdAt = "2026-07-13T08:00:00.000Z";

export function userFixture(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "user-1",
    username: "member",
    displayName: "参赛者",
    email: "member@gmail.com",
    emailVerified: true,
    role: "USER",
    approvalStatus: "APPROVED",
    createdAt,
    ...overrides,
  };
}

export function adminUserFixture(
  overrides: Partial<AdminUser> = {},
): AdminUser {
  return {
    ...userFixture(),
    reviewedAt: null,
    reviewedBy: null,
    ...overrides,
  };
}

export function gameSummaryFixture(
  overrides: Partial<GameSummary> = {},
): GameSummary {
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
    ...overrides,
  };
}

export function gameDetailFixture(
  overrides: Partial<GameDetail> = {},
): GameDetail {
  return {
    ...gameSummaryFixture(),
    description: "一个通用的双人策略游戏。",
    rulesMarkdown:
      "## 基本规则\n\n双方轮流落子，率先连成五子者获胜。\n\n## 通信协议\n\n从标准输入读取局面，向标准输出写入行动。",
    ...overrides,
  };
}

export function adminGameFixture(
  overrides: Partial<AdminGame> = {},
): AdminGame {
  return {
    ...gameDetailFixture(),
    isPublished: true,
    createdAt,
    updatedAt: "2026-07-13T09:00:00.000Z",
    ...overrides,
  };
}

export function builtinPlayerFixture(
  overrides: Partial<AdminBuiltinPlayer> = {},
): AdminBuiltinPlayer {
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
      language: "CPP",
      sourceCode: "int main() {}",
      sourceSha256:
        "00096d96da5299e65479678a8e79b07ab36e6185120e892a1360e1be25e84fbb",
      createdAt,
    },
    createdAt,
    updatedAt: "2026-07-13T09:00:00.000Z",
    ...overrides,
  };
}

export function submissionRecordFixture(
  overrides: Partial<SubmissionRecord> = {},
): SubmissionRecord {
  return {
    id: "version-1",
    playerId: "player-1",
    playerName: "edge-player",
    version: 1,
    language: "CPP",
    author: {
      id: "user-2",
      username: "other-user",
      displayName: "其他用户",
    },
    status: "FINISHED",
    evaluationSummary: { total: 1, finished: 1, won: 1 },
    score: 100,
    createdAt,
    ...overrides,
  };
}

export function evaluationFixture(
  overrides: Partial<Evaluation> = {},
): Evaluation {
  return {
    id: "evaluation-1",
    opponentVersionId: "builtin-version-1",
    opponentName: "基准程序",
    opponentVersion: 1,
    opponentWeight: 1,
    won: true,
    status: "FINISHED",
    verdict: "ACCEPTED",
    compileStatus: "Accepted",
    compileLog: null,
    runStatus: "Accepted",
    stdout: null,
    stderr: null,
    cpuTimeNs: "1000000",
    wallTimeNs: "2000000",
    memoryBytes: "1048576",
    errorMessage: null,
    replay: null,
    createdAt,
    startedAt: "2026-07-13T08:00:01.000Z",
    finishedAt: "2026-07-13T08:00:02.000Z",
    ...overrides,
  };
}

export function submissionDetailFixture(
  overrides: Partial<SubmissionDetail> = {},
): SubmissionDetail {
  return {
    ...submissionRecordFixture(),
    game: {
      slug: "gomoku",
      name: "五子棋",
      rulesVersion: "gomoku-v1",
    },
    sourceCode: "int main() {}",
    sourceSha256:
      "00096d96da5299e65479678a8e79b07ab36e6185120e892a1360e1be25e84fbb",
    evaluations: [evaluationFixture()],
    ...overrides,
  };
}

export function replayFixture(
  overrides: Partial<GomokuReplay> = {},
): GomokuReplay {
  return {
    gameSlug: "gomoku",
    width: 3,
    height: 3,
    userSeat: 0,
    moves: [
      { x: 0, y: 0, seat: 0 },
      { x: 1, y: 1, seat: 1 },
      { x: 2, y: 0, seat: 0 },
    ],
    result: { type: "win", winner: 0 },
    ...overrides,
  };
}
