import {
  submissionDetailSchema,
  submissionRecordListSchema,
  type Evaluation,
  type SubmissionDetail,
  type SubmissionRecord,
  type SubmissionRecordList,
} from "@compintel/contracts";
import type { PrismaClient } from "@compintel/db";

import { HttpError } from "./errors.js";

export interface SubmissionRecordPageInput {
  page: number;
  pageSize: number;
}

export class EvaluationRecordService {
  constructor(private readonly db: PrismaClient) {}

  async listForGame(
    gameSlug: string,
    input: SubmissionRecordPageInput,
  ): Promise<SubmissionRecordList> {
    const game = await this.db.game.findFirst({
      where: { slug: gameSlug, isPublished: true },
      select: { id: true },
    });
    if (game === null) {
      throw new HttpError(404, "游戏不存在或尚未发布", "GAME_NOT_FOUND");
    }

    const where = { gameId: game.id, kind: "USER" as const };
    const [total, versions] = await this.db.$transaction([
      this.db.playerVersion.count({ where: { player: where } }),
      this.db.playerVersion.findMany({
        where: { player: where },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          player: {
            include: {
              owner: {
                select: { id: true, username: true, displayName: true },
              },
            },
          },
          evaluations: { select: { status: true, won: true } },
        },
      }),
    ]);

    return submissionRecordListSchema.parse({
      submissions: versions.map(serializeSubmissionRecord),
      page: input.page,
      pageSize: input.pageSize,
      total,
    });
  }

  async getDetail(playerVersionId: string): Promise<SubmissionDetail> {
    const version = await this.db.playerVersion.findFirst({
      where: {
        id: playerVersionId,
        player: { kind: "USER", game: { isPublished: true } },
      },
      include: {
        player: {
          include: {
            game: true,
            owner: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
        evaluations: {
          orderBy: { createdAt: "asc" },
          include: {
            opponentVersion: {
              select: {
                version: true,
                player: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (version === null) {
      throw new HttpError(404, "评测记录不存在", "SUBMISSION_NOT_FOUND");
    }

    return submissionDetailSchema.parse({
      ...serializeSubmissionRecord(version),
      game: {
        slug: version.player.game.slug,
        name: version.player.game.name,
        rulesVersion: version.player.game.rulesVersion,
      },
      sourceCode: version.sourceCode,
      sourceSha256: version.sourceSha256,
      evaluations: version.evaluations.map(serializeEvaluation),
    });
  }
}

interface RecordSource {
  id: string;
  playerId: string;
  version: number;
  language: "CPP";
  createdAt: Date;
  score: number | null;
  player: {
    name: string;
    owner: {
      id: string;
      username: string;
      displayName: string;
    } | null;
  };
  evaluations: Array<{
    status: Evaluation["status"];
    won: boolean;
  }>;
}

function serializeSubmissionRecord(version: RecordSource): SubmissionRecord {
  if (version.player.owner === null) {
    throw new Error(`user player version ${version.id} has no owner`);
  }
  const finished = version.evaluations.filter(
    (evaluation) => evaluation.status === "FINISHED",
  ).length;
  const won = version.evaluations.filter((evaluation) => evaluation.won).length;
  const total = version.evaluations.length;
  const status =
    total > 0 && finished === total
      ? "FINISHED"
      : version.evaluations.some((evaluation) => evaluation.status !== "QUEUED")
        ? "RUNNING"
        : "QUEUED";
  return {
    id: version.id,
    playerId: version.playerId,
    playerName: version.player.name,
    version: version.version,
    language: version.language,
    author: version.player.owner,
    status,
    evaluationSummary: { total, finished, won },
    score: version.score,
    createdAt: version.createdAt.toISOString(),
  };
}

function serializeEvaluation(evaluation: {
  id: string;
  opponentVersionId: string;
  opponentWeight: number;
  won: boolean;
  status: Evaluation["status"];
  verdict: Evaluation["verdict"];
  compileStatus: string | null;
  compileLog: string | null;
  runStatus: string | null;
  stdout: string | null;
  stderr: string | null;
  cpuTimeNs: bigint | null;
  wallTimeNs: bigint | null;
  memoryBytes: bigint | null;
  errorMessage: string | null;
  replay: unknown;
  opponentVersion: { version: number; player: { name: string } };
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): Evaluation {
  return {
    id: evaluation.id,
    opponentVersionId: evaluation.opponentVersionId,
    opponentName: evaluation.opponentVersion.player.name,
    opponentVersion: evaluation.opponentVersion.version,
    opponentWeight: evaluation.opponentWeight,
    won: evaluation.won,
    status: evaluation.status,
    verdict: evaluation.verdict,
    compileStatus: evaluation.compileStatus,
    compileLog: evaluation.compileLog,
    runStatus: evaluation.runStatus,
    stdout: evaluation.stdout,
    stderr: evaluation.stderr,
    cpuTimeNs: evaluation.cpuTimeNs?.toString() ?? null,
    wallTimeNs: evaluation.wallTimeNs?.toString() ?? null,
    memoryBytes: evaluation.memoryBytes?.toString() ?? null,
    errorMessage: evaluation.errorMessage,
    replay: evaluation.replay as Evaluation["replay"],
    createdAt: evaluation.createdAt.toISOString(),
    startedAt: evaluation.startedAt?.toISOString() ?? null,
    finishedAt: evaluation.finishedAt?.toISOString() ?? null,
  };
}
