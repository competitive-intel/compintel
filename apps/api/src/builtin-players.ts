import { createHash } from "node:crypto";

import {
  adminBuiltinPlayerSchema,
  type AdminBuiltinPlayer,
  type CreateBuiltinPlayerInput,
  type CreateBuiltinPlayerVersionInput,
  type UpdateBuiltinPlayerInput,
} from "@compintel/contracts";
import { Prisma, type PrismaClient } from "@compintel/db";

import { HttpError } from "./errors.js";

const playerInclude = {
  versions: {
    orderBy: { version: "desc" as const },
    take: 1,
    select: {
      id: true,
      version: true,
      language: true,
      sourceCode: true,
      sourceSha256: true,
      createdAt: true,
    },
  },
  _count: { select: { versions: true } },
} as const;

export class BuiltinPlayerService {
  constructor(private readonly db: PrismaClient) {}

  async list(gameId: string): Promise<AdminBuiltinPlayer[]> {
    await this.requireGame(gameId);
    const players = await this.db.player.findMany({
      where: { gameId, kind: "PLATFORM" },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
      include: playerInclude,
    });
    return players.map(serializePlayer);
  }

  async create(
    gameId: string,
    input: CreateBuiltinPlayerInput,
  ): Promise<AdminBuiltinPlayer> {
    await this.requireGame(gameId);
    await this.requireAvailableName(gameId, input.name);
    try {
      const player = await this.db.player.create({
        data: {
          gameId,
          ownerId: null,
          kind: "PLATFORM",
          name: input.name,
          isActive: input.isActive,
          weight: input.weight,
          versions: {
            create: {
              version: 1,
              language: "CPP",
              sourceCode: input.sourceCode,
              sourceSha256: sha256(input.sourceCode),
            },
          },
        },
        include: playerInclude,
      });
      return serializePlayer(player);
    } catch (error) {
      throwNameConflict(error);
    }
  }

  async update(
    playerId: string,
    input: UpdateBuiltinPlayerInput,
  ): Promise<AdminBuiltinPlayer> {
    const player = await this.requirePlatformPlayer(playerId);
    if (input.name !== undefined && input.name !== player.name) {
      await this.requireAvailableName(player.gameId, input.name, player.id);
    }
    try {
      return serializePlayer(
        await this.db.player.update({
          where: { id: playerId },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.isActive === undefined
              ? {}
              : { isActive: input.isActive }),
            ...(input.weight === undefined ? {} : { weight: input.weight }),
          },
          include: playerInclude,
        }),
      );
    } catch (error) {
      throwNameConflict(error);
    }
  }

  async createVersion(
    playerId: string,
    input: CreateBuiltinPlayerVersionInput,
  ): Promise<AdminBuiltinPlayer> {
    await this.requirePlatformPlayer(playerId);
    try {
      await this.db.$transaction(
        async (tx) => {
          const latest = await tx.playerVersion.findFirst({
            where: { playerId },
            orderBy: { version: "desc" },
            select: { version: true, sourceSha256: true },
          });
          if (latest === null) {
            throw new HttpError(
              409,
              "内置程序没有可更新的版本",
              "BUILTIN_PLAYER_VERSION_MISSING",
            );
          }
          const sourceSha256 = sha256(input.sourceCode);
          if (latest.sourceSha256 === sourceSha256) {
            throw new HttpError(
              409,
              "源码与当前版本相同",
              "BUILTIN_PLAYER_SOURCE_UNCHANGED",
            );
          }
          await tx.playerVersion.create({
            data: {
              playerId,
              version: latest.version + 1,
              language: "CPP",
              sourceCode: input.sourceCode,
              sourceSha256,
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new HttpError(
          409,
          "内置程序版本已被并发更新，请重试",
          "BUILTIN_PLAYER_VERSION_CONFLICT",
        );
      }
      throw error;
    }
    return this.get(playerId);
  }

  private async get(playerId: string): Promise<AdminBuiltinPlayer> {
    const player = await this.db.player.findFirst({
      where: { id: playerId, kind: "PLATFORM" },
      include: playerInclude,
    });
    if (player === null) {
      throw builtinPlayerNotFound();
    }
    return serializePlayer(player);
  }

  private async requireGame(gameId: string): Promise<void> {
    const game = await this.db.game.findUnique({
      where: { id: gameId },
      select: { id: true },
    });
    if (game === null) {
      throw new HttpError(404, "游戏不存在", "GAME_NOT_FOUND");
    }
  }

  private async requirePlatformPlayer(playerId: string) {
    const player = await this.db.player.findFirst({
      where: { id: playerId, kind: "PLATFORM" },
      select: { id: true, gameId: true, name: true },
    });
    if (player === null) {
      throw builtinPlayerNotFound();
    }
    return player;
  }

  private async requireAvailableName(
    gameId: string,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const conflicting = await this.db.player.findFirst({
      where: {
        gameId,
        kind: "PLATFORM",
        name,
        ...(excludedId === undefined ? {} : { id: { not: excludedId } }),
      },
      select: { id: true },
    });
    if (conflicting !== null) {
      throw builtinPlayerNameConflict();
    }
  }
}

type PlayerRow = {
  id: string;
  gameId: string;
  name: string;
  isActive: boolean;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{
    id: string;
    version: number;
    language: "CPP";
    sourceCode: string;
    sourceSha256: string;
    createdAt: Date;
  }>;
  _count: { versions: number };
};

function serializePlayer(player: PlayerRow): AdminBuiltinPlayer {
  const latestVersion = player.versions[0];
  if (latestVersion === undefined) {
    throw new Error(`platform player ${player.id} has no version`);
  }
  return adminBuiltinPlayerSchema.parse({
    id: player.id,
    gameId: player.gameId,
    name: player.name,
    isActive: player.isActive,
    weight: player.weight,
    versionCount: player._count.versions,
    latestVersion: {
      ...latestVersion,
      createdAt: latestVersion.createdAt.toISOString(),
    },
    createdAt: player.createdAt.toISOString(),
    updatedAt: player.updatedAt.toISOString(),
  });
}

function sha256(sourceCode: string): string {
  return createHash("sha256").update(sourceCode).digest("hex");
}

function builtinPlayerNotFound(): HttpError {
  return new HttpError(404, "内置程序不存在", "BUILTIN_PLAYER_NOT_FOUND");
}

function builtinPlayerNameConflict(): HttpError {
  return new HttpError(
    409,
    "同一游戏中已存在同名内置程序",
    "BUILTIN_PLAYER_NAME_CONFLICT",
  );
}

function throwNameConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw builtinPlayerNameConflict();
  }
  throw error;
}
