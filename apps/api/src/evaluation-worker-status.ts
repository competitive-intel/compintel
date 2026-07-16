import type { EvaluationWorkerStatus } from "@compintel/contracts";
import type { Logger } from "@compintel/logger";

interface WorkerRegistry {
  getWorkersCount(): Promise<number>;
}

type AvailabilityState = "online" | "offline" | "unknown";

export class EvaluationWorkerStatusService {
  private lastState: AvailabilityState | undefined;

  constructor(
    private readonly registry: WorkerRegistry,
    private readonly logger?: Logger,
  ) {}

  async get(): Promise<EvaluationWorkerStatus> {
    try {
      const workerCount = await this.registry.getWorkersCount();
      const online = workerCount > 0;
      const state = online ? "online" : "offline";
      if (state !== this.lastState) {
        if (online) {
          this.logger?.info(
            { event: "queue.workers_available", workerCount },
            "evaluation workers are available",
          );
        } else {
          this.logger?.warn(
            { event: "queue.no_workers", workerCount },
            "no evaluation workers are connected",
          );
        }
      }
      this.lastState = state;
      return { online, workerCount };
    } catch (error) {
      if (this.lastState !== "unknown") {
        this.logger?.warn(
          { err: error, event: "queue.worker_status_check_failed" },
          "failed to check evaluation worker availability",
        );
      }
      this.lastState = "unknown";
      throw error;
    }
  }
}
