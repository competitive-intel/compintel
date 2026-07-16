import { z } from "zod";

export const evaluationWorkerStatusSchema = z.object({
  online: z.boolean(),
  workerCount: z.number().int().nonnegative(),
});

export type EvaluationWorkerStatus = z.infer<
  typeof evaluationWorkerStatusSchema
>;
