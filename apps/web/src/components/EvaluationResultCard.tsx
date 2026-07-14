import type { Evaluation } from "@compintel/contracts";
import { ChevronDownIcon } from "lucide-react";

import { GameReplayBoard } from "../games";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

const verdictLabels: Record<NonNullable<Evaluation["verdict"]>, string> = {
  ACCEPTED: "评测通过",
  COMPILE_ERROR: "编译错误",
  RUNTIME_ERROR: "运行错误",
  TIME_LIMIT_EXCEEDED: "时间超限",
  MEMORY_LIMIT_EXCEEDED: "内存超限",
  OUTPUT_LIMIT_EXCEEDED: "输出超限",
  DANGEROUS_SYSCALL: "危险系统调用",
  INVALID_MOVE: "非法操作",
  INTERNAL_ERROR: "平台内部错误",
};

export function EvaluationResultCard({
  evaluation,
}: {
  evaluation: Evaluation;
}) {
  const hasLogs = Boolean(
    evaluation.compileLog || evaluation.stderr || evaluation.stdout,
  );

  return (
    <Collapsible defaultOpen className="group/evaluation">
      <Card>
        <CardHeader className="transition-[padding] group-data-[state=closed]/evaluation:py-4">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="min-w-0">
              <h3 className="break-words">{evaluation.opponentName}</h3>
            </CardTitle>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline">权重 {evaluation.opponentWeight}</Badge>
              {evaluation.won && <Badge>已击败</Badge>}
              <EvaluationBadge evaluation={evaluation} />
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`展开或收起 ${evaluation.opponentName} 的评测结果`}
                  className="group size-7"
                >
                  <ChevronDownIcon className="transition-transform group-data-[state=closed]:-rotate-90" />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-6">
            <dl className="grid overflow-hidden rounded-md border sm:grid-cols-3">
              <Metric
                label="CPU 时间"
                value={formatDuration(evaluation.cpuTimeNs)}
              />
              <Metric
                label="墙上时间"
                value={formatDuration(evaluation.wallTimeNs)}
              />
              <Metric
                label="峰值内存"
                value={formatBytes(evaluation.memoryBytes)}
              />
            </dl>

            {evaluation.errorMessage && (
              <Alert variant="destructive">
                <AlertTitle>评测异常</AlertTitle>
                <AlertDescription>{evaluation.errorMessage}</AlertDescription>
              </Alert>
            )}

            {evaluation.replay && (
              <>
                <Separator />
                <section
                  className="flex flex-col gap-4"
                  aria-labelledby={`replay-${evaluation.id}`}
                >
                  <h4 id={`replay-${evaluation.id}`} className="font-medium">
                    对局回放
                  </h4>
                  <GameReplayBoard replay={evaluation.replay} />
                </section>
              </>
            )}

            {hasLogs && (
              <>
                <Separator />
                <section
                  className="flex flex-col gap-3"
                  aria-labelledby={`logs-${evaluation.id}`}
                >
                  <h4 id={`logs-${evaluation.id}`} className="font-medium">
                    运行日志
                  </h4>
                  <div className="divide-y overflow-hidden rounded-md border">
                    <LogDetails
                      title="编译日志"
                      content={evaluation.compileLog}
                    />
                    <LogDetails title="标准错误" content={evaluation.stderr} />
                    <LogDetails title="标准输出" content={evaluation.stdout} />
                  </div>
                </section>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function EvaluationBadge({ evaluation }: { evaluation: Evaluation }) {
  if (evaluation.status !== "FINISHED") {
    return (
      <Badge variant={evaluation.status === "QUEUED" ? "outline" : "secondary"}>
        {evaluation.status === "QUEUED" ? "排队中" : "评测中"}
      </Badge>
    );
  }
  if (evaluation.verdict === "ACCEPTED") return <Badge>评测通过</Badge>;
  return (
    <Badge variant="destructive">
      {evaluation.verdict ? verdictLabels[evaluation.verdict] : "结果未知"}
    </Badge>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-b px-4 py-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function LogDetails({
  title,
  content,
}: {
  title: string;
  content: string | null;
}) {
  if (!content) return null;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        {title}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <pre className="max-h-80 overflow-auto border-t bg-muted/40 p-4 font-mono text-xs leading-6 whitespace-pre-wrap text-foreground">
        {content}
      </pre>
    </details>
  );
}

function formatDuration(value: string | null): string {
  if (value === null) return "—";
  const milliseconds = Number(value) / 1_000_000;
  if (milliseconds < 1) return `${milliseconds.toFixed(3)} ms`;
  return `${milliseconds.toFixed(2)} ms`;
}

function formatBytes(value: string | null): string {
  if (value === null) return "—";
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
