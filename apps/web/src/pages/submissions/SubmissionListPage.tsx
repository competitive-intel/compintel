import { useQuery } from "@tanstack/react-query";
import type { SubmissionRecord } from "@compintel/contracts";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

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
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../components/ui/empty";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { ApiError, getSubmissionRecords } from "../../lib/api";
import { usePageTitle } from "../../lib/use-page-title";

const PAGE_SIZE = 20;

export function SubmissionListPage() {
  usePageTitle("评测记录");
  const { gameSlug = "" } = useParams();
  const [page, setPage] = useState(1);
  const records = useQuery({
    queryKey: ["submission-records", gameSlug, page],
    queryFn: ({ signal }) =>
      getSubmissionRecords(gameSlug, page, PAGE_SIZE, signal),
    enabled: gameSlug.length > 0,
    refetchInterval: (query) =>
      query.state.data?.submissions.some(
        (submission) => submission.status !== "FINISHED",
      )
        ? 5_000
        : false,
  });

  const totalPages = records.data
    ? Math.max(1, Math.ceil(records.data.total / records.data.pageSize))
    : 1;

  return (
    <section className="flex flex-col gap-8 py-8 sm:py-10">
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
              <Link to={`/games/${gameSlug}`}>游戏详情</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>评测记录</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <PageTitle>评测记录</PageTitle>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            查看这个游戏下的提交和评测结果。
          </p>
        </div>
      </header>

      {records.isPending && <SubmissionListSkeleton />}

      {records.isError && (
        <Alert variant="destructive">
          <AlertTitle>评测记录加载失败</AlertTitle>
          <AlertDescription>
            {records.error instanceof ApiError
              ? records.error.message
              : "请稍后重试"}
          </AlertDescription>
        </Alert>
      )}

      {records.data?.submissions.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>这个游戏还没有用户提交</EmptyTitle>
            <EmptyDescription>
              新的提交版本完成创建后，会显示在这里。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {records.data && records.data.submissions.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>全部提交</CardTitle>
            <CardDescription>共 {records.data.total} 条记录</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="min-w-190">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[34%] px-6">程序</TableHead>
                  <TableHead className="w-[20%]">提交者</TableHead>
                  <TableHead className="w-[28%]">评测结果</TableHead>
                  <TableHead className="w-[18%] pr-6">提交时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.data.submissions.map((submission) => (
                  <SubmissionRow key={submission.id} submission={submission} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {records.data && records.data.total > PAGE_SIZE && (
        <nav
          className="flex items-center justify-between gap-4"
          aria-label="评测记录分页"
        >
          <Button
            variant="outline"
            disabled={page <= 1 || records.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <Button
            variant="outline"
            disabled={page >= totalPages || records.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </Button>
        </nav>
      )}
    </section>
  );
}

function SubmissionRow({ submission }: { submission: SubmissionRecord }) {
  return (
    <TableRow className="relative">
      <TableCell className="px-6 py-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              className="truncate font-medium underline-offset-4 after:absolute after:inset-0 hover:underline"
              to={`/submissions/${submission.id}`}
            >
              {submission.playerName}
            </Link>
            <Badge variant="outline">v{submission.version}</Badge>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span>{submission.author.displayName}</span>
          <span className="text-xs text-muted-foreground">
            @{submission.author.username}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <StatusBadge status={submission.status} />
          <span className="text-xs text-muted-foreground">
            击败 {submission.evaluationSummary.won}/
            {submission.evaluationSummary.total} 个对手
          </span>
          <Badge variant="outline">
            {submission.score === null ? "待评分" : `${submission.score} 分`}
          </Badge>
        </div>
      </TableCell>
      <TableCell className="pr-6">
        <time
          className="text-sm text-muted-foreground"
          dateTime={submission.createdAt}
        >
          {formatDate(submission.createdAt)}
        </time>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: SubmissionRecord["status"] }) {
  if (status === "FINISHED") return <Badge>已完成</Badge>;
  if (status === "RUNNING") return <Badge variant="secondary">评测中</Badge>;
  return <Badge variant="outline">排队中</Badge>;
}

function SubmissionListSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status">
      <span className="sr-only">正在加载评测记录…</span>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
