import assert from "node:assert/strict";
import test from "node:test";

import type {
  InteractiveJudgeSession,
  JudgeClient,
  JudgeResult,
  JudgeTurnResult,
} from "@compintel/judge-client";

import {
  EvaluationProcessor,
  runGomokuEvaluation,
  runQuoridorEvaluation,
  type EvaluationRepository,
  type FinishEvaluationInput,
} from "../src/evaluation-processor.js";

class MemoryRepository implements EvaluationRepository {
  finished: FinishEvaluationInput | undefined;

  async start() {
    return {
      status: "QUEUED" as const,
      sourceCode: "// user source",
      gameSlug: "gomoku",
      resourceLimits: {
        moveCpuLimitMs: 100,
        totalCpuLimitMs: 5_000,
        memoryLimitMiB: 256,
      },
      opponent: {
        sourceCode: "// platform source",
      },
    };
  }

  async markRunning() {}

  async finish(_id: string, result: FinishEvaluationInput) {
    this.finished = result;
  }
}

function acceptedResult(): JudgeResult {
  return {
    status: "Accepted",
    time: 10,
    memory: 20,
    runTime: 30,
    files: { stdout: "", stderr: "" },
  };
}

class FirstEmptySession implements InteractiveJudgeSession {
  readonly inputs: string[] = [];
  readonly occupied = new Set<string>();
  turns = 0;

  async playTurn(stdin: string): Promise<JudgeTurnResult> {
    this.inputs.push(stdin);
    this.turns += 1;
    const values = stdin.trim().split(/\s+/u).map(Number);
    const initialization = values[0] === 1 && values.length >= 4;
    const moveOffset = initialization ? 4 : 0;
    for (let index = moveOffset; index + 1 < values.length; index += 2) {
      this.occupied.add(`${values[index]},${values[index + 1]}`);
    }

    for (let x = 0; x < 15; x += 1) {
      for (let y = 0; y < 15; y += 1) {
        const key = `${x},${y}`;
        if (!this.occupied.has(key)) {
          this.occupied.add(key);
          return completedTurn(this.turns, `${x} ${y}\n`);
        }
      }
    }
    return completedTurn(this.turns, "0 0\n");
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

class ScriptedSession implements InteractiveJudgeSession {
  readonly inputs: string[] = [];
  #turn = 0;

  constructor(private readonly outputs: readonly string[]) {}

  async playTurn(stdin: string): Promise<JudgeTurnResult> {
    this.inputs.push(stdin);
    const output = this.outputs[this.#turn];
    this.#turn += 1;
    if (output === undefined) throw new Error("script has no next move");
    return completedTurn(this.#turn, output);
  }

  async finish(): Promise<JudgeResult> {
    return acceptedResult();
  }
}

function judgeWithSessions(
  playerSession: InteractiveJudgeSession,
  opponentSession: InteractiveJudgeSession,
): JudgeClient {
  let compilation = 0;
  return {
    async compileCpp() {
      compilation += 1;
      return {
        result: acceptedResult(),
        executableFileId:
          compilation === 1 ? "player-binary" : "opponent-binary",
      };
    },
    async runExecutable() {
      throw new Error("one-shot execution must not be used");
    },
    async startInteractive(fileId) {
      return fileId === "player-binary" ? playerSession : opponentSession;
    },
    async deleteFile() {},
  };
}

test("coordinates two sandboxed C++ programs for a complete game", async () => {
  const player = new FirstEmptySession();
  const opponent = new FirstEmptySession();
  const run = await runGomokuEvaluation(player, opponent);

  assert.equal(run.verdict, "ACCEPTED");
  assert.ok(player.turns > 1);
  assert.ok(opponent.turns > 1);
  assert.equal(opponent.inputs[0], "1\n15 15\n0\n");
  assert.equal(player.inputs[0], "1\n15 15\n1\n0 0\n");
  assert.equal(run.playerTotalCpuNs, player.turns * 10);
  assert.equal(run.opponentTotalCpuNs, opponent.turns * 10);
  assert.ok(run.replay.moves.every((move, index) => move.seat === index % 2));
});

test("coordinates quoridor protocol initialization and alternating moves", async () => {
  const opponent = new ScriptedSession(
    Array.from({ length: 8 }, (_, index) => `0 4 ${index + 1}\n`),
  );
  const player = new ScriptedSession(
    Array.from({ length: 7 }, (_, index) =>
      index % 2 === 0 ? "0 3 8\n" : "0 4 8\n",
    ),
  );

  const run = await runQuoridorEvaluation(player, opponent);

  assert.equal(run.verdict, "ACCEPTED");
  assert.deepEqual(run.replay.result, { type: "win", winner: 0 });
  assert.equal(opponent.inputs[0], "1 0\n");
  assert.equal(player.inputs[0], "1 1\n0 4 1\n");
  assert.equal(run.replay.moves.length, 15);
});

test("compiles both database-backed sources before running", async () => {
  const repository = new MemoryRepository();
  const compiledSources: string[] = [];
  const judge = judgeWithSessions(
    new FirstEmptySession(),
    new FirstEmptySession(),
  );
  const originalCompile = judge.compileCpp.bind(judge);
  judge.compileCpp = async (source) => {
    compiledSources.push(source);
    return originalCompile(source);
  };

  await new EvaluationProcessor(repository, judge).process("evaluation-id");

  assert.deepEqual(compiledSources, ["// user source", "// platform source"]);
  assert.equal(repository.finished?.verdict, "ACCEPTED");
  assert.equal(repository.finished?.opponentCompileStatus, "Accepted");
  assert.equal(repository.finished?.opponentMemoryBytes, 20n);
});

test("starts both players with resource limits from the game", async () => {
  const repository = new MemoryRepository();
  repository.start = async () => ({
    status: "QUEUED" as const,
    sourceCode: "// user source",
    gameSlug: "gomoku",
    resourceLimits: {
      moveCpuLimitMs: 250,
      totalCpuLimitMs: 8_000,
      memoryLimitMiB: 384,
    },
    opponent: {
      sourceCode: "// platform source",
    },
  });
  const options: Parameters<JudgeClient["startInteractive"]>[1][] = [];
  const judge = judgeWithSessions(
    new FirstEmptySession(),
    new FirstEmptySession(),
  );
  const startInteractive = judge.startInteractive.bind(judge);
  judge.startInteractive = async (fileId, receivedOptions) => {
    options.push(receivedOptions);
    return startInteractive(fileId, receivedOptions);
  };

  await new EvaluationProcessor(repository, judge).process("evaluation-id");

  assert.equal(options.length, 2);
  assert.ok(
    options.every(
      (value) =>
        value.moveCpuLimitNs === 250_000_000 &&
        value.totalCpuLimitNs === 8_000_000_000 &&
        value.memoryLimitBytes === 384 * 1024 * 1024,
    ),
  );
});

test("reports an invalid user move without losing sandbox metrics", async () => {
  const repository = new MemoryRepository();
  const player: InteractiveJudgeSession = {
    async playTurn() {
      return completedTurn(1, "outside board\n");
    },
    async finish() {
      return acceptedResult();
    },
  };

  await new EvaluationProcessor(
    repository,
    judgeWithSessions(player, new FirstEmptySession()),
  ).process("evaluation-id");
  assert.equal(repository.finished?.verdict, "INVALID_MOVE");
  assert.equal(repository.finished?.memoryBytes, 20n);
});

test("treats an invalid platform move as an internal configuration error", async () => {
  const opponent: InteractiveJudgeSession = {
    async playTurn() {
      return completedTurn(1, "invalid\n");
    },
    async finish() {
      return acceptedResult();
    },
  };
  const run = await runGomokuEvaluation(new FirstEmptySession(), opponent);

  assert.equal(run.verdict, "INTERNAL_ERROR");
  assert.match(run.errorMessage ?? "", /platform opponent/u);
});

test("maps a user per-turn CPU timeout", async () => {
  const repository = new MemoryRepository();
  const player: InteractiveJudgeSession = {
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

  await new EvaluationProcessor(
    repository,
    judgeWithSessions(player, new FirstEmptySession()),
  ).process("evaluation-id");
  assert.equal(repository.finished?.verdict, "TIME_LIMIT_EXCEEDED");
  assert.equal(repository.finished?.cpuTimeNs, 101_000_000n);
});

test("reports a platform compilation failure as an internal error", async () => {
  const repository = new MemoryRepository();
  let compilation = 0;
  const judge: JudgeClient = {
    async compileCpp() {
      compilation += 1;
      return compilation === 1
        ? { result: acceptedResult(), executableFileId: "player-binary" }
        : {
            result: {
              ...acceptedResult(),
              status: "Non Zero Exit Status",
              error: "syntax error",
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
  assert.equal(
    repository.finished?.opponentCompileStatus,
    "Non Zero Exit Status",
  );
});
