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

const quoridorCatalog = {
  name: "路墙棋",
  summary: "移动棋子或设置两格长墙，率先抵达对边即可获胜。",
  description:
    "双方各控制一枚棋子和十面墙，通过移动、跳跃与布墙争夺通往对边的路线。平台会编译你的 C++ 程序，并让它分别挑战本游戏下的全部启用内置 AI。",
  rulesMarkdown: `## 基本规则

棋盘包含 $9 \\times 9$ 个棋格。坐标从左上角开始，横向为 $X$、纵向为 $Y$，范围均为 0 到 8。先手从 $(4,0)$ 出发并以 $Y=8$ 为目标，后手从 $(4,8)$ 出发并以 $Y=0$ 为目标。每方有十面长度为两个棋格的墙。

每回合选择移动棋子或放置一面墙。棋子通常移动到没有墙阻挡的上下左右相邻格；若对手棋子相邻，可以沿同一方向跳到其后方。若后方越界或被墙阻挡，可以斜跳到对手两侧没有墙阻挡的格子。墙不能重叠或互相穿过，也不能令任何一方失去到达目标边的全部路径。墙一旦放下便不能移动或收回。率先抵达目标边的一方获胜。

## 程序通信协议

程序启动后读取一行 \`1 S\`，其中协议版本为 1，\`S\` 是己方席位（先手为 0，后手为 1）。先手立即输出一步；此后每轮先读取对手的一步，再输出己方一步，并立即刷新标准输出。

移动棋子输出 \`0 X Y\`。放墙输出 \`1 X Y O\`，其中 \`X,Y\` 是墙中心所在的内部交叉点，范围均为 1 到 8；\`O=0\` 表示竖墙，\`O=1\` 表示横墙。输入流结束表示对局已经结束。`,
  rulesVersion: "quoridor-standard-v1",
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
  await db.game.upsert({
    where: { slug: "quoridor" },
    update: quoridorCatalog,
    create: {
      slug: "quoridor",
      ...quoridorCatalog,
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
