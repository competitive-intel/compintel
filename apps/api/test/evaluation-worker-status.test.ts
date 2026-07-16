import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import { createLogger } from "@compintel/logger";

import { EvaluationWorkerStatusService } from "../src/evaluation-worker-status.js";

test("reports worker availability and logs only state changes", async () => {
  const counts = [0, 0, 2];
  const entries: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      entries.push(chunk.toString());
      callback();
    },
  });
  const service = new EvaluationWorkerStatusService(
    {
      async getWorkersCount() {
        return counts.shift() ?? 2;
      },
    },
    createLogger({ service: "worker-status-test", destination }),
  );

  assert.deepEqual(await service.get(), { online: false, workerCount: 0 });
  assert.deepEqual(await service.get(), { online: false, workerCount: 0 });
  assert.deepEqual(await service.get(), { online: true, workerCount: 2 });

  const logs = entries
    .join("")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { event?: string });
  assert.equal(
    logs.filter((entry) => entry.event === "queue.no_workers").length,
    1,
  );
  assert.equal(
    logs.filter((entry) => entry.event === "queue.workers_available").length,
    1,
  );
});

test("logs an unavailable status check before propagating the error", async () => {
  const entries: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      entries.push(chunk.toString());
      callback();
    },
  });
  const service = new EvaluationWorkerStatusService(
    {
      async getWorkersCount() {
        throw new Error("redis unavailable");
      },
    },
    createLogger({ service: "worker-status-test", destination }),
  );

  await assert.rejects(service.get(), /redis unavailable/);
  assert.equal(
    entries.join("").includes("queue.worker_status_check_failed"),
    true,
  );
});
