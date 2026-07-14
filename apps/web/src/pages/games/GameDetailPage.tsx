import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { GameSubmissionPanel } from "../../components/GameSubmissionPanel";
import { MarkdownContent } from "../../components/MarkdownContent";
import { PageTitle } from "../../components/PageTitle";
import { ResourceLimitBadges } from "../../components/ResourceLimitBadges";
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
import { Skeleton } from "../../components/ui/skeleton";
import { ApiError, getGame } from "../../lib/api";
import { usePageTitle } from "../../lib/use-page-title";

export function GameDetailPage() {
  const { gameSlug = "" } = useParams();
  const game = useQuery({
    queryKey: ["games", gameSlug],
    queryFn: ({ signal }) => getGame(gameSlug, signal),
    enabled: gameSlug.length > 0,
  });
  usePageTitle(game.data?.name ?? "游戏详情");

  if (game.isPending) return <GameDetailSkeleton />;
  if (game.isError) {
    return (
      <Alert className="my-10" variant="destructive">
        <CircleAlert />
        <AlertTitle>无法加载游戏详情</AlertTitle>
        <AlertDescription>
          {game.error instanceof ApiError
            ? game.error.message
            : "游戏详情加载失败"}
        </AlertDescription>
      </Alert>
    );
  }

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
            <BreadcrumbPage>{game.data.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-3">
            <PageTitle>{game.data.name}</PageTitle>
            <p className="text-muted-foreground leading-7">
              {game.data.summary}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">开放提交</Badge>
              <ResourceLimitBadges limits={game.data.resourceLimits} />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <Link to={`/games/${game.data.slug}/submissions`}>
                查看评测记录
              </Link>
            </Button>
            <Button onClick={() => scrollToSubmit()}>提交</Button>
          </div>
        </div>
      </header>

      <section aria-label="游戏说明">
        <MarkdownContent>{game.data.rulesMarkdown}</MarkdownContent>
      </section>

      <GameSubmissionPanel gameSlug={game.data.slug} />
    </article>
  );
}

function GameDetailSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8 py-10 sm:py-12">
      <span className="sr-only">正在加载游戏详情…</span>
      <Skeleton className="h-5 w-40" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="flex max-w-4xl flex-col gap-8">
        <Skeleton className="h-7 w-28" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="h-7 w-52" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

function scrollToSubmit() {
  document.getElementById("submit")?.scrollIntoView({ behavior: "smooth" });
}
