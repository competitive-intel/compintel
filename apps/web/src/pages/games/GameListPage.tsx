import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, Gamepad2 } from "lucide-react";
import { Link } from "react-router-dom";

import { PageTitle } from "../../components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import { Skeleton } from "../../components/ui/skeleton";
import { ApiError, getGames } from "../../lib/api";
import { usePageTitle } from "../../lib/use-page-title";

export const gamesQueryKey = ["games"] as const;

export function GameListPage() {
  usePageTitle("游戏目录");
  const games = useQuery({
    queryKey: gamesQueryKey,
    queryFn: ({ signal }) => getGames(signal),
  });

  return (
    <section className="flex flex-col gap-8 py-10 sm:py-12">
      <header>
        <PageTitle>游戏目录</PageTitle>
      </header>

      {games.isPending && <GameListSkeleton />}
      {games.isError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>无法加载游戏目录</AlertTitle>
          <AlertDescription>
            {games.error instanceof ApiError
              ? games.error.message
              : "游戏目录加载失败"}
          </AlertDescription>
        </Alert>
      )}
      {games.data?.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Gamepad2 />
            </EmptyMedia>
            <EmptyTitle>当前还没有已发布的游戏</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {games.data !== undefined && games.data.length > 0 && (
        <ul aria-label="游戏列表" className="divide-y border-b">
          {games.data.map((game) => (
            <li
              key={game.id}
              className="flex flex-col gap-5 py-6 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link
                className="group flex min-w-0 flex-1 flex-col gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                to={`/games/${game.slug}`}
              >
                <h2 className="text-lg font-semibold underline-offset-4 group-hover:underline">
                  {game.name}
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {game.summary}
                </p>
              </Link>
              <Button
                asChild
                className="self-start sm:self-auto"
                variant="ghost"
              >
                <Link to={`/games/${game.slug}`}>
                  查看游戏
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GameListSkeleton() {
  return (
    <div aria-busy="true" className="divide-y border-b">
      <span className="sr-only">正在加载游戏目录…</span>
      {[0, 1].map((item) => (
        <div
          key={item}
          className="flex flex-col gap-4 py-6 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      ))}
    </div>
  );
}
