import { z } from "zod";

const judgeResultSchema = z.object({
  status: z.string(),
  exitStatus: z.number().int().optional(),
  error: z.string().optional(),
  time: z.number().nonnegative(),
  memory: z.number().nonnegative(),
  runTime: z.number().nonnegative(),
  procPeak: z.number().nonnegative().optional(),
  files: z.record(z.string(), z.string()).optional(),
  fileIds: z.record(z.string(), z.string()).optional(),
});

export const judgeResponseSchema = z.array(judgeResultSchema).min(1);

export const judgeStreamResponseSchema = z.object({
  requestId: z.string(),
  results: z.array(judgeResultSchema).min(1),
  error: z.string().optional(),
});

export const judgeTurnEventTypeSchema = z.enum([
  "turnCompleted",
  "moveCpuLimitExceeded",
  "totalCpuLimitExceeded",
  "moveWallLimitExceeded",
  "turnOutputLimitExceeded",
  "processExited",
  "controlError",
]);

export const judgeTurnResultSchema = z.object({
  requestId: z.string(),
  index: z.number().int(),
  turnId: z.number().int().nonnegative(),
  type: judgeTurnEventTypeSchema,
  moveCpu: z.number().nonnegative(),
  totalCpu: z.number().nonnegative(),
  wallTime: z.number().nonnegative(),
  output: z.string().optional(),
  error: z.string().optional(),
});

export type JudgeResult = z.infer<typeof judgeResultSchema>;
export type JudgeTurnResult = z.infer<typeof judgeTurnResultSchema>;

export interface CompileResult {
  result: JudgeResult;
  executableFileId: string | null;
}

export interface InteractiveRunOptions {
  moveCpuLimitNs: number;
  totalCpuLimitNs: number;
  /** Per-turn wall-clock budget for a single playTurn. */
  wallLimitNs: number;
  /**
   * Whole-process wall-clock budget for the long-running interactive session.
   * Defaults to 300s when omitted.
   */
  processClockLimitNs?: number;
  maxOutputBytes: number;
  memoryLimitBytes: number;
  stackLimitBytes: number;
  processLimit: number;
}

export interface InteractiveJudgeSession {
  playTurn(stdin: string): Promise<JudgeTurnResult>;
  finish(): Promise<JudgeResult>;
}

export interface JudgeClient {
  compileCpp(sourceCode: string): Promise<CompileResult>;
  runExecutable(executableFileId: string, stdin: string): Promise<JudgeResult>;
  startInteractive(
    executableFileId: string,
    options: InteractiveRunOptions,
  ): Promise<InteractiveJudgeSession>;
  deleteFile(fileId: string): Promise<void>;
}
