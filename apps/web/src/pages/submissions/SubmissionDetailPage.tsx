import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { EvaluationResultCard } from "../../components/EvaluationResultCard";
import { CodeHighlight } from "../../components/CodeHighlight";
import { PageTitle } from "../../components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../../components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../components/ui/empty";
import { Separator } from "../../components/ui/separator";
import { Skeleton } from "../../components/ui/skeleton";
import { ApiError, getSubmissionDetail } from "../../lib/api";
import { usePageTitle } from "../../lib/use-page-title";

export function SubmissionDetailPage() {
  const { submissionId = "" } = useParams();
  const submission = useQuery({
    queryKey: ["submission", submissionId],
    queryFn: ({ signal }) => getSubmissionDetail(submissionId, signal),
    enabled: submissionId.length > 0,
    refetchInterval: (query) =>
      query.state.data?.status === "FINISHED" ? false : 3_000,
  });
  usePageTitle(submission.data?.playerName ?? "评测详情");

  if (submission.isPending) {
    return <SubmissionDetailSkeleton />;
  }
  if (submission.isError) {
    return (
      <div className="py-10">
        <Alert variant="destructive">
          <AlertTitle>评测详情加载失败</AlertTitle>
          <AlertDescription>
            {submission.error instanceof ApiError
              ? submission.error.message
              : "请稍后重试"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const detail = submission.data;
  return (
    <article className="flex flex-col gap-8 py-8 sm:py-10">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/games">游戏目录</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/games/${detail.game.slug}`}>{detail.game.name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/games/${detail.game.slug}/submissions`}>
                评测记录
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{detail.playerName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <SubmissionBadge status={detail.status} />
              <Badge variant="outline">C++ · v{detail.version}</Badge>
              <Badge variant="outline">规则 {detail.game.rulesVersion}</Badge>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <PageTitle className="break-words">{detail.playerName}</PageTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                由{" "}
                <span className="text-foreground">
                  {detail.author.displayName}
                </span>{" "}
                <span>@{detail.author.username}</span> 提交于{" "}
                <time dateTime={detail.createdAt}>
                  {formatDate(detail.createdAt)}
                </time>
              </p>
            </div>
          </div>

          <Card>
            <CardHeader className="sr-only">
              <CardTitle>评测概览</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-4 p-0">
              <SummaryMetric
                label="对手"
                value={detail.evaluationSummary.total}
              />
              <SummaryMetric
                label="已完成"
                value={detail.evaluationSummary.finished}
              />
              <SummaryMetric
                label="击败对手"
                value={detail.evaluationSummary.won}
              />
              <SummaryMetric label="得分" value={detail.score ?? "—"} />
            </CardContent>
          </Card>
        </div>
      </header>

      <Separator />

      <CodeHighlight code={detail.sourceCode} label="提交源码" />

      <section
        className="flex flex-col gap-5"
        aria-labelledby="evaluation-results"
      >
        <div className="flex flex-col gap-2">
          <h2 id="evaluation-results" className="text-2xl font-semibold">
            评测结果
          </h2>
          {detail.status !== "FINISHED" && (
            <p className="text-sm text-muted-foreground">
              页面会自动刷新，直到全部评测完成。
            </p>
          )}
        </div>

        {detail.evaluations.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>这个提交没有关联的评测任务</EmptyTitle>
              <EmptyDescription>
                评测任务创建后，对战结果会显示在这里。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-5">
            {detail.evaluations.map((evaluation) => (
              <EvaluationResultCard
                key={evaluation.id}
                evaluation={evaluation}
              />
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

function SubmissionBadge({
  status,
}: {
  status: "QUEUED" | "RUNNING" | "FINISHED";
}) {
  if (status === "FINISHED") return <Badge>评测完成</Badge>;
  if (status === "RUNNING") return <Badge variant="secondary">评测中</Badge>;
  return <Badge variant="outline">排队中</Badge>;
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex min-w-20 flex-col items-center gap-1 border-r px-4 py-4 last:border-r-0 sm:min-w-24 sm:px-5">
      <strong className="text-xl font-semibold tabular-nums">{value}</strong>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function SubmissionDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 py-10" role="status">
      <span className="sr-only">正在加载评测详情…</span>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}
