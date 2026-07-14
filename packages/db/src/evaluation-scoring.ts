import { Prisma, type PrismaClient } from "../generated/client/client.js";

export interface WeightedEvaluationResult {
  status: "QUEUED" | "COMPILING" | "RUNNING" | "FINISHED";
  opponentWeight: number;
  won: boolean;
}

export function calculateWeightedScore(
  evaluations: readonly WeightedEvaluationResult[],
): number | null {
  if (
    evaluations.length === 0 ||
    evaluations.some((evaluation) => evaluation.status !== "FINISHED")
  ) {
    return null;
  }

  const totalWeight = evaluations.reduce(
    (total, evaluation) => total + evaluation.opponentWeight,
    0,
  );
  if (totalWeight <= 0) {
    throw new Error("evaluation opponent weights must have a positive sum");
  }
  const defeatedWeight = evaluations.reduce(
    (total, evaluation) =>
      total + (evaluation.won ? evaluation.opponentWeight : 0),
    0,
  );
  return Math.floor((defeatedWeight * 100) / totalWeight);
}

export async function updateEvaluationAndScore(
  db: PrismaClient,
  evaluationId: string,
  data: Prisma.EvaluationUpdateInput,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.findUnique({
      where: { id: evaluationId },
      select: { playerVersionId: true },
    });
    if (evaluation === null) {
      throw new Error(`evaluation ${evaluationId} does not exist`);
    }

    await tx.$queryRaw`
      SELECT "id"
      FROM "PlayerVersion"
      WHERE "id" = ${evaluation.playerVersionId}
      FOR UPDATE
    `;
    await tx.evaluation.update({ where: { id: evaluationId }, data });

    const evaluations = await tx.evaluation.findMany({
      where: { playerVersionId: evaluation.playerVersionId },
      select: { status: true, opponentWeight: true, won: true },
    });
    const score = calculateWeightedScore(evaluations);
    if (score !== null) {
      await tx.playerVersion.update({
        where: { id: evaluation.playerVersionId },
        data: { score },
      });
    }
  });
}
