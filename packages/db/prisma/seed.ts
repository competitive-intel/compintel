import { createDbClient } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is required");
}

const db = createDbClient(databaseUrl);

try {
  const game = await db.game.upsert({
    where: { slug: "gomoku" },
    update: { name: "五子棋", rulesVersion: "gomoku-standard-v1" },
    create: {
      slug: "gomoku",
      name: "五子棋",
      rulesVersion: "gomoku-standard-v1",
    },
  });

  const strategy = await db.player.findFirst({
    where: { gameId: game.id, kind: "PLATFORM", name: "四连围堵" },
  });
  if (strategy === null) {
    await db.player.create({
      data: {
        gameId: game.id,
        kind: "PLATFORM",
        name: "四连围堵",
        versions: {
          create: {
            version: 1,
            language: "BUILTIN",
            implementationKey: "gomoku:block-four-random:v1",
          },
        },
      },
    });
  }
} finally {
  await db.$disconnect();
}
