import {
  adminGameSchema,
  gameDetailSchema,
  gameSummarySchema,
  type AdminGame,
  type GameDetail,
  type GameSummary,
  type UpdateGameInput,
} from "@compintel/contracts";
import { type Prisma, type PrismaClient } from "@compintel/db";

import { HttpError } from "./errors.js";

const gameSelect = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  description: true,
  rulesMarkdown: true,
  rulesVersion: true,
  moveCpuLimitMs: true,
  totalCpuLimitMs: true,
  memoryLimitMiB: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class GameService {
  constructor(private readonly db: PrismaClient) {}

  async listPublished(): Promise<GameSummary[]> {
    const games = await this.db.game.findMany({
      where: { isPublished: true },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
      select: gameSelect,
    });
    return games.map(serializeSummary);
  }

  async getPublished(slug: string): Promise<GameDetail> {
    const game = await this.db.game.findFirst({
      where: { slug, isPublished: true },
      select: gameSelect,
    });
    if (game === null) {
      throw new HttpError(404, "游戏不存在或尚未发布", "GAME_NOT_FOUND");
    }
    return serializeDetail(game);
  }

  async listAll(): Promise<AdminGame[]> {
    const games = await this.db.game.findMany({
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
      select: gameSelect,
    });
    return games.map(serializeAdmin);
  }

  async update(id: string, input: UpdateGameInput): Promise<AdminGame> {
    const game = await this.db.game.findUnique({
      where: { id },
      select: { id: true },
    });
    if (game === null) {
      throw new HttpError(404, "游戏不存在", "GAME_NOT_FOUND");
    }
    const data: Prisma.GameUpdateInput = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.rulesMarkdown === undefined
        ? {}
        : { rulesMarkdown: input.rulesMarkdown }),
      ...(input.rulesVersion === undefined
        ? {}
        : { rulesVersion: input.rulesVersion }),
      ...(input.resourceLimits === undefined
        ? {}
        : {
            moveCpuLimitMs: input.resourceLimits.moveCpuLimitMs,
            totalCpuLimitMs: input.resourceLimits.totalCpuLimitMs,
            memoryLimitMiB: input.resourceLimits.memoryLimitMiB,
          }),
      ...(input.isPublished === undefined
        ? {}
        : { isPublished: input.isPublished }),
    };
    return serializeAdmin(
      await this.db.game.update({
        where: { id },
        data,
        select: gameSelect,
      }),
    );
  }
}

type GameRow = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  rulesMarkdown: string;
  rulesVersion: string;
  moveCpuLimitMs: number;
  totalCpuLimitMs: number;
  memoryLimitMiB: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function serializeSummary(game: GameRow): GameSummary {
  return gameSummarySchema.parse(withResourceLimits(game));
}

function serializeDetail(game: GameRow): GameDetail {
  return gameDetailSchema.parse(withResourceLimits(game));
}

function serializeAdmin(game: GameRow): AdminGame {
  return adminGameSchema.parse({
    ...withResourceLimits(game),
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  });
}

function withResourceLimits(game: GameRow) {
  const { moveCpuLimitMs, totalCpuLimitMs, memoryLimitMiB, ...catalogFields } =
    game;
  return {
    ...catalogFields,
    resourceLimits: {
      moveCpuLimitMs,
      totalCpuLimitMs,
      memoryLimitMiB,
    },
  };
}
