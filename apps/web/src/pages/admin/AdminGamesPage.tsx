import type { AdminGame, UpdateGameInput } from "@compintel/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gamepad2, LoaderCircle } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { BuiltinPlayersPanel } from "../../components/BuiltinPlayersPanel";
import { PageTitle } from "../../components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../../components/ui/input-group";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import { ApiError, getAdminGames, updateGame } from "../../lib/api";
import { cn } from "../../lib/utils";
import { usePageTitle } from "../../lib/use-page-title";
import { gamesQueryKey } from "../games/GameListPage";

const adminGamesQueryKey = ["admin", "games"] as const;

type SaveRequest = { gameId: string; input: UpdateGameInput };

type GameFormValues = Pick<
  AdminGame,
  | "slug"
  | "name"
  | "summary"
  | "description"
  | "rulesMarkdown"
  | "rulesVersion"
  | "isPublished"
> & {
  resourceLimits: {
    moveCpuLimitMs: string;
    totalCpuLimitMs: string;
    memoryLimitMiB: string;
  };
};

export function AdminGamesPage() {
  usePageTitle("游戏管理");
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const games = useQuery({
    queryKey: adminGamesQueryKey,
    queryFn: ({ signal }) => getAdminGames(signal),
  });

  useEffect(() => {
    if (selectedId === null && games.data?.[0] !== undefined) {
      setSelectedId(games.data[0].id);
    }
  }, [games.data, selectedId]);

  const save = useMutation({
    mutationFn: (request: SaveRequest) =>
      updateGame(request.gameId, request.input),
    onSuccess: (saved) => {
      queryClient.setQueryData<AdminGame[]>(adminGamesQueryKey, (current) => {
        return current?.map((game) => (game.id === saved.id ? saved : game));
      });
      void queryClient.invalidateQueries({ queryKey: gamesQueryKey });
      setSelectedId(saved.id);
    },
  });

  const selectedGame =
    games.data?.find((game) => game.id === selectedId) ?? null;

  return (
    <section className="py-10 sm:py-12">
      <header className="mb-8">
        <PageTitle>游戏管理</PageTitle>
      </header>

      {games.isPending && (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="animate-spin" />
          正在加载游戏…
        </div>
      )}
      {games.isError && (
        <StatusPanel tone="error">
          {games.error instanceof ApiError
            ? games.error.message
            : "游戏管理列表加载失败"}
        </StatusPanel>
      )}
      {games.data !== undefined && (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="h-fit overflow-hidden">
            <div className="border-b bg-muted/50 px-4 py-3 text-xs font-medium text-muted-foreground">
              {games.data.length} 个游戏
            </div>
            <div className="divide-y">
              {games.data.map((game) => (
                <CatalogButton
                  key={game.id}
                  active={selectedId === game.id}
                  name={game.name}
                  detail={game.slug}
                  published={game.isPublished}
                  onClick={() => setSelectedId(game.id)}
                />
              ))}
              {games.data.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  暂无游戏
                </p>
              )}
            </div>
          </Card>

          {selectedGame !== null ? (
            <div className="flex min-w-0 flex-col gap-6">
              <GameForm
                key={selectedGame.id}
                game={selectedGame}
                busy={save.isPending}
                error={save.error}
                onSubmit={(input) =>
                  save.mutate({
                    gameId: selectedGame.id,
                    input,
                  })
                }
              />
              <BuiltinPlayersPanel
                gameId={selectedGame.id}
                gameName={selectedGame.name}
              />
            </div>
          ) : (
            <StatusPanel>暂无可管理的游戏，请先通过源代码配置游戏</StatusPanel>
          )}
        </div>
      )}
    </section>
  );
}

function CatalogButton({
  active,
  name,
  detail,
  published,
  onClick,
}: {
  active: boolean;
  name: string;
  detail: string;
  published?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full px-4 py-4 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-muted/70",
      )}
      type="button"
      onClick={onClick}
    >
      <span className="flex items-center justify-between gap-3">
        <strong className="truncate text-sm font-medium">{name}</strong>
        {published !== undefined && (
          <Badge variant={published ? "default" : "secondary"}>
            {published ? "已发布" : "草稿"}
          </Badge>
        )}
      </span>
      <span className="mt-1 block truncate text-xs text-muted-foreground">
        {detail}
      </span>
    </button>
  );
}

function GameForm({
  game,
  busy,
  error,
  onSubmit,
}: {
  game: AdminGame;
  busy: boolean;
  error: Error | null;
  onSubmit: (input: UpdateGameInput) => void;
}) {
  const [values, setValues] = useState<GameFormValues>({
    slug: game.slug,
    name: game.name,
    summary: game.summary,
    description: game.description,
    rulesMarkdown: game.rulesMarkdown,
    rulesVersion: game.rulesVersion,
    resourceLimits: {
      moveCpuLimitMs: String(game.resourceLimits.moveCpuLimitMs),
      totalCpuLimitMs: String(game.resourceLimits.totalCpuLimitMs),
      memoryLimitMiB: String(game.resourceLimits.memoryLimitMiB),
    },
    isPublished: game.isPublished,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(withoutSlug(values));
  }

  function setText(
    field: Exclude<keyof GameFormValues, "slug" | "isPublished">,
    value: string,
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function setResourceLimit(
    field: keyof GameFormValues["resourceLimits"],
    value: string,
  ) {
    setValues((current) => ({
      ...current,
      resourceLimits: { ...current.resourceLimits, [field]: value },
    }));
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>
              <h2 className="truncate">编辑 {game.name}</h2>
            </CardTitle>
          </div>
          <Field orientation="horizontal" className="w-auto shrink-0">
            <FieldLabel htmlFor="game-published">对用户发布</FieldLabel>
            <Switch
              id="game-published"
              checked={values.isPublished}
              onCheckedChange={(checked) =>
                setValues((current) => ({
                  ...current,
                  isPublished: checked,
                }))
              }
            />
          </Field>
        </CardHeader>

        <CardContent>
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="game-name">游戏名称</FieldLabel>
              <Input
                id="game-name"
                value={values.name}
                onChange={(event) => setText("name", event.target.value)}
                minLength={2}
                maxLength={40}
                required
              />
            </Field>
            <Field data-disabled>
              <FieldLabel htmlFor="game-slug">游戏标识</FieldLabel>
              <Input id="game-slug" value={values.slug} disabled required />
            </Field>
            <Field>
              <FieldLabel htmlFor="rules-version">规则版本</FieldLabel>
              <Input
                id="rules-version"
                value={values.rulesVersion}
                onChange={(event) =>
                  setText("rulesVersion", event.target.value)
                }
                maxLength={64}
                placeholder="game-standard-v1"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="game-summary">列表摘要</FieldLabel>
              <Input
                id="game-summary"
                value={values.summary}
                onChange={(event) => setText("summary", event.target.value)}
                maxLength={160}
                required
              />
            </Field>
          </FieldGroup>

          <FieldSet className="mt-6">
            <FieldLegend>评测资源限制</FieldLegend>
            <FieldGroup className="grid gap-5 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="move-cpu-limit">每步 CPU 时间</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="move-cpu-limit"
                    type="number"
                    value={values.resourceLimits.moveCpuLimitMs}
                    onChange={(event) =>
                      setResourceLimit("moveCpuLimitMs", event.target.value)
                    }
                    min={1}
                    max={60_000}
                    required
                  />
                  <InputGroupAddon align="inline-end">ms</InputGroupAddon>
                </InputGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="total-cpu-limit">总 CPU 时间</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="total-cpu-limit"
                    type="number"
                    value={values.resourceLimits.totalCpuLimitMs}
                    onChange={(event) =>
                      setResourceLimit("totalCpuLimitMs", event.target.value)
                    }
                    min={1}
                    max={600_000}
                    required
                  />
                  <InputGroupAddon align="inline-end">ms</InputGroupAddon>
                </InputGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="memory-limit">内存限制</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="memory-limit"
                    type="number"
                    value={values.resourceLimits.memoryLimitMiB}
                    onChange={(event) =>
                      setResourceLimit("memoryLimitMiB", event.target.value)
                    }
                    min={16}
                    max={4_096}
                    required
                  />
                  <InputGroupAddon align="inline-end">MiB</InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldGroup className="mt-6 gap-5">
            <Field>
              <FieldLabel htmlFor="game-description">游戏介绍</FieldLabel>
              <Textarea
                id="game-description"
                value={values.description}
                onChange={(event) => setText("description", event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="game-rules-markdown">
                游戏规则与程序通信协议（Markdown）
              </FieldLabel>
              <Textarea
                id="game-rules-markdown"
                className="min-h-80 font-mono text-sm leading-6"
                value={values.rulesMarkdown}
                onChange={(event) =>
                  setText("rulesMarkdown", event.target.value)
                }
                placeholder={"## 基本规则\n\n...\n\n## 程序通信协议\n\n..."}
                required
              />
            </Field>
          </FieldGroup>
        </CardContent>

        <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-end">
          {error !== null && (
            <Alert className="sm:mr-auto" variant="destructive">
              <AlertTitle>保存失败</AlertTitle>
              <AlertDescription>
                {error instanceof ApiError ? error.message : "请稍后重试"}
              </AlertDescription>
            </Alert>
          )}
          <Button className="shrink-0" type="submit" disabled={busy}>
            {busy && (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            )}
            {busy ? "正在保存…" : "保存修改"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function withoutSlug(input: GameFormValues): UpdateGameInput {
  return {
    name: input.name,
    summary: input.summary,
    description: input.description,
    rulesMarkdown: input.rulesMarkdown,
    rulesVersion: input.rulesVersion,
    resourceLimits: {
      moveCpuLimitMs: Number(input.resourceLimits.moveCpuLimitMs),
      totalCpuLimitMs: Number(input.resourceLimits.totalCpuLimitMs),
      memoryLimitMiB: Number(input.resourceLimits.memoryLimitMiB),
    },
    isPublished: input.isPublished,
  };
}

function StatusPanel({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "error";
}) {
  if (tone === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>无法加载游戏管理信息</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Gamepad2 />
        </EmptyMedia>
        <EmptyTitle>{children}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}
