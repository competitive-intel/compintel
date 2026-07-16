import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";

import { getEvaluationWorkerStatus } from "../lib/api";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

export const evaluationWorkerStatusQueryKey = [
  "admin",
  "evaluation-worker-status",
] as const;

export function EvaluationWorkerStatusAlert() {
  const status = useQuery({
    queryKey: evaluationWorkerStatusQueryKey,
    queryFn: ({ signal }) => getEvaluationWorkerStatus(signal),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  if (status.isPending || (!status.isError && status.data?.online === true)) {
    return null;
  }

  const unavailable = status.isError;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>
          {unavailable ? "无法确认评测 Worker 状态" : "评测 Worker 未运行"}
        </AlertTitle>
        <AlertDescription>
          {unavailable
            ? "API 无法读取队列消费者状态，请检查 Redis 连接和服务日志。"
            : "新提交将停留在“排队中”。请恢复 compintel-worker 服务，并确认 Worker 与 API 使用相同的 Redis。"}
        </AlertDescription>
      </Alert>
    </div>
  );
}
