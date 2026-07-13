import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCK_FOUR_RANDOM_V1_KEY,
  blockFourRandomV1,
} from "@compintel/builtin-players";
import type {
  InteractiveJudgeSession,
  JudgeClient,
  JudgeResult,
  JudgeTurnResult,
} from "@compintel/judge-client";
import { JudgePlayerOutputError } from "@compintel/judge-client";

import {
  EvaluationProcessor,
  runGomokuEvaluation,
  type EvaluationRepository,
  type FinishEvaluationInput,
} from "../src/evaluation-processor.js";

class MemoryRepository implements EvaluationRepository {
  finished: FinishEvaluationInput | undefined;

  async start() {
    return {
      status: "QUEUED" as const,
      sourceCode: "int main() {}",
      language: "CPP" as const,
      gameSlug: "gomoku",
      opponent: {
        playerVersionId: "builtin-version-id",
        language: "BUILTIN" as const,
        implementationKey: BLOCK_FOUR_RANDOM_V1_KEY,
      },
    };
  }

  async markRunning() {}

  async finish(_id: string, result: FinishEvaluationInput) {
    this.finished = result;
  }
}

function acceptedResult(stdout = ""): JudgeResult {
  return {
    status: "Accepted",
    time: 10,
    memory: 20,
    runTime: 30,
    files: { stdout, stderr: "" },
  };
}

class FirstEmptySession implements InteractiveJudgeSession {
  readonly inputs: string[] = [];
  readonly occupied = new Set<string>();
  turns = 0;

  async playTurn(stdin: string): Promise<JudgeTurnResult> {
    this.inputs.push(stdin);
    this.turns += 1;
    const lines = stdin.trim().split("\n");
    const isInitialization = lines[0] === "1" && lines.length >= 3;
    const hasOpponentMove = !isInitialization || lines.length === 4;
    if (hasOpponentMove) {
      const opponent = lines.at(-1)!.split(" ").map(Number);
      this.occupied.add(`${opponent[0]},${opponent[1]}`);
    }

    let move = "";
    for (let x = 0; x < 15 && move === ""; x += 1) {
      for (let y = 0; y < 15; y += 1) {
        const key = `${x},${y}`;
        if (!this.occupied.has(key)) {
          this.occupied.add(key);
          move = `${x} ${y}\n`;
          break;
        }
      }
    }
    return completedTurn(this.turns, move);
  }

  async finish(): Promise<JudgeResult> {
    return acceptedResult();
  }
}

function completedTurn(turnId: number, output: string): JudgeTurnResult {
  return {
    requestId: "request-id",
    index: 0,
    turnId,
    type: "turnCompleted",
    moveCpu: 10,
    totalCpu: turnId * 10,
    wallTime: 20,
    output,
  };
}

function judgeWithSession(session: InteractiveJudgeSession): JudgeClient {
  return {
    async compileCpp() {
      return {
        result: acceptedResult(),
        executableFileId: "binary-id",
      };
    },
    async runExecutable() {
      throw new Error("one-shot execution must not be used");
    },
    async startInteractive() {
      return session;
    },
    async deleteFile() {},
  };
}

test("plays multiple turns against the built-in strategy", async () => {
  const session = new FirstEmptySession();
  const run = await runGomokuEvaluation(session, blockFourRandomV1, () => 0);

  assert.equal(run.verdict, "ACCEPTED");
  assert.ok(session.turns > 1);
  assert.equal(session.inputs[0], "1\n15 15\n1\n0 0\n");
  assert.match(session.inputs[1]!, /^\d+ \d+\n$/u);
  assert.equal(run.totalCpuNs, session.turns * 10);
});

test("lets seat zero move immediately after initialization", async () => {
  const session = new FirstEmptySession();
  const run = await runGomokuEvaluation(session, blockFourRandomV1, () => 0, 0);

  assert.equal(run.verdict, "ACCEPTED");
  assert.equal(session.inputs[0], "1\n15 15\n0\n");
  assert.ok(session.turns > 1);
});

test("accepts a compiled player after a complete legal game", async () => {
  const repository = new MemoryRepository();
  const processor = new EvaluationProcessor(
    repository,
    judgeWithSession(new FirstEmptySession()),
  );

  await processor.process("evaluation-id");
  assert.equal(repository.finished?.verdict, "ACCEPTED");
  assert.ok((repository.finished?.stdout.length ?? 0) > 4);
});

test("reports invalid move without losing sandbox metrics", async () => {
  const repository = new MemoryRepository();
  const session: InteractiveJudgeSession = {
    async playTurn() {
      return completedTurn(1, "outside board\n");
    },
    async finish() {
      return acceptedResult();
    },
  };

  await new EvaluationProcessor(repository, judgeWithSession(session)).process(
    "evaluation-id",
  );
  assert.equal(repository.finished?.verdict, "INVALID_MOVE");
  assert.equal(repository.finished?.memoryBytes, 20n);
});

test("reports output outside turn control as an invalid move", async () => {
  const session: InteractiveJudgeSession = {
    async playTurn() {
      throw new JudgePlayerOutputError("early output");
    },
    async finish() {
      return acceptedResult();
    },
  };

  const run = await runGomokuEvaluation(session, blockFourRandomV1, () => 0);
  assert.equal(run.verdict, "INVALID_MOVE");
  assert.equal(run.errorMessage, "early output");
});

test("maps a per-turn CPU timeout and retains turn CPU usage", async () => {
  const repository = new MemoryRepository();
  const session: InteractiveJudgeSession = {
    async playTurn() {
      return {
        ...completedTurn(1, ""),
        type: "moveCpuLimitExceeded",
        moveCpu: 101_000_000,
        totalCpu: 101_000_000,
      };
    },
    async finish() {
      return acceptedResult();
    },
  };

  await new EvaluationProcessor(repository, judgeWithSession(session)).process(
    "evaluation-id",
  );
  assert.equal(repository.finished?.verdict, "TIME_LIMIT_EXCEEDED");
  assert.equal(repository.finished?.cpuTimeNs, 101_000_000n);
  assert.match(repository.finished?.errorMessage ?? "", /100ms/u);
});

test("reports a sandbox compile failure as an internal error", async () => {
  const repository = new MemoryRepository();
  const judge: JudgeClient = {
    async compileCpp() {
      return {
        result: {
          status: "Internal Error",
          error: "cgroup unavailable",
          time: 0,
          memory: 0,
          runTime: 0,
        },
        executableFileId: null,
      };
    },
    async runExecutable() {
      throw new Error("should not run");
    },
    async startInteractive() {
      throw new Error("should not run");
    },
    async deleteFile() {},
  };

  await new EvaluationProcessor(repository, judge).process("evaluation-id");
  assert.equal(repository.finished?.verdict, "INTERNAL_ERROR");
});
