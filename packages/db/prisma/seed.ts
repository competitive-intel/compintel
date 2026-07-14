import { randomBytes, scryptSync } from "node:crypto";

import { createDbClient } from "../src/index.js";

const gomokuCatalog = {
  name: "五子棋",
  summary: "在 15×15 棋盘上率先连成五子的经典双人对弈。",
  description:
    "参赛程序通过标准输入输出与平台逐回合通信。平台会编译你的 C++ 程序，并让它分别挑战当前游戏下的全部内置 AI。",
  rulesMarkdown: `## 基本规则

棋盘大小为 $15 \\times 15$，坐标从 0 开始。

白方先手，双方轮流在空位落下一子。横向、纵向或斜向率先形成连续五子的一方获胜；棋盘填满且无人获胜则为平局。当前版本不采用禁手规则。

## 程序通信协议

程序启动后首先读取四个整数：协议版本、棋盘高度、棋盘宽度和己方座位。

轮到己方行动时，向标准输出写入两个整数 \`X Y\` 并立即刷新；随后从标准输入读取对手的 \`X Y\`。座位 0 先行，座位 1 会先收到对手的第一步。输入流结束表示对局已经结束。`,
  rulesVersion: "gomoku-standard-v1",
  isPublished: true,
};

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is required");
}

const db = createDbClient(databaseUrl);

try {
  await ensureAdministrator();
  await db.game.upsert({
    where: { slug: "gomoku" },
    update: gomokuCatalog,
    create: {
      slug: "gomoku",
      ...gomokuCatalog,
    },
  });
} finally {
  await db.$disconnect();
}

async function ensureAdministrator(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
  if (password === undefined || password === "") {
    console.warn("ADMIN_PASSWORD is not set; skipping administrator seed");
    return;
  }
  const username = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? "平台管理员";
  const passwordHash = hashPassword(password);
  await db.user.upsert({
    where: { username },
    update: {
      displayName,
      passwordHash,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    },
    create: {
      username,
      displayName,
      passwordHash,
      role: "ADMIN",
      approvalStatus: "APPROVED",
    },
  });
}

function hashPassword(password: string): string {
  const parameters = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1_024 * 1_024 };
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64, parameters);
  return [
    "scrypt",
    parameters.N,
    parameters.r,
    parameters.p,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}
