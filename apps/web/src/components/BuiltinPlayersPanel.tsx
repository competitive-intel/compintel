import type {
  AdminBuiltinPlayer,
  CreateBuiltinPlayerInput,
} from "@compintel/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, LoaderCircle, Plus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import {
  ApiError,
  createBuiltinPlayer,
  createBuiltinPlayerVersion,
  getAdminBuiltinPlayers,
  updateBuiltinPlayer,
} from "../lib/api";
import { cn } from "../lib/utils";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { CodeEditor } from "./CodeEditor";

type SaveRequest =
  | { mode: "create"; input: CreateBuiltinPlayerInput }
  | {
      mode: "update";
      original: AdminBuiltinPlayer;
      name: string;
      isActive: boolean;
      weight: number;
      sourceCode: string;
    };

export function BuiltinPlayersPanel({
  gameId,
  gameName,
}: {
  gameId: string;
  gameName: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "games", gameId, "builtin-players"] as const;
  const [selectedId, setSelectedId] = useState<string>("new");
  const players = useQuery({
    queryKey,
    queryFn: ({ signal }) => getAdminBuiltinPlayers(gameId, signal),
  });

  useEffect(() => {
    if (
      selectedId !== "new" &&
      !players.data?.some((player) => player.id === selectedId)
    ) {
      setSelectedId(players.data?.[0]?.id ?? "new");
    }
  }, [players.data, selectedId]);

  const save = useMutation({
    mutationFn: async (request: SaveRequest) => {
      if (request.mode === "create") {
        return createBuiltinPlayer(gameId, request.input);
      }
      let saved = request.original;
      if (
        request.name !== request.original.name ||
        request.isActive !== request.original.isActive ||
        request.weight !== request.original.weight
      ) {
        saved = await updateBuiltinPlayer(request.original.id, {
          name: request.name,
          isActive: request.isActive,
          weight: request.weight,
        });
      }
      if (request.sourceCode !== request.original.latestVersion.sourceCode) {
        saved = await createBuiltinPlayerVersion(request.original.id, {
          sourceCode: request.sourceCode,
        });
      }
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<AdminBuiltinPlayer[]>(queryKey, (current) => {
        const exists = current?.some((player) => player.id === saved.id);
        return exists
          ? current?.map((player) => (player.id === saved.id ? saved : player))
          : [...(current ?? []), saved];
      });
      setSelectedId(saved.id);
    },
  });

  const selected =
    players.data?.find((player) => player.id === selectedId) ?? null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle>
            <h2>内置程序</h2>
          </CardTitle>
          <CardDescription>{gameName} 的平台对手</CardDescription>
        </div>
        <Button variant="outline" onClick={() => setSelectedId("new")}>
          <Plus data-icon="inline-start" />
          添加程序
        </Button>
      </CardHeader>

      {players.isPending && (
        <CardContent className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="animate-spin" />
          正在加载内置程序…
        </CardContent>
      )}
      {players.isError && (
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>内置程序列表加载失败</AlertTitle>
            <AlertDescription>
              {players.error instanceof ApiError
                ? players.error.message
                : "请稍后重试"}
            </AlertDescription>
          </Alert>
        </CardContent>
      )}
      {players.data !== undefined && (
        <CardContent className="p-0">
          <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
            <div className="border-b lg:border-r lg:border-b-0">
              <div className="divide-y">
                {selectedId === "new" && (
                  <PlayerButton active name="新内置程序" detail="尚未保存" />
                )}
                {players.data.map((player) => (
                  <PlayerButton
                    key={player.id}
                    active={selectedId === player.id}
                    name={player.name}
                    detail={`CPP · v${player.latestVersion.version} · 权重 ${player.weight}`}
                    isActive={player.isActive}
                    onClick={() => setSelectedId(player.id)}
                  />
                ))}
                {players.data.length === 0 && selectedId !== "new" && (
                  <Empty className="rounded-none border-0 py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Bot />
                      </EmptyMedia>
                      <EmptyTitle>暂无内置程序</EmptyTitle>
                      <EmptyDescription>
                        添加一个平台对手后才能接受用户提交。
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </div>

            {selectedId === "new" ? (
              <BuiltinPlayerForm
                key="new"
                busy={save.isPending}
                error={save.error}
                onSubmit={(input) => save.mutate({ mode: "create", input })}
              />
            ) : selected !== null ? (
              <BuiltinPlayerForm
                key={`${selected.id}-${selected.latestVersion.id}`}
                player={selected}
                busy={save.isPending}
                error={save.error}
                onSubmit={(input) =>
                  save.mutate({
                    mode: "update",
                    original: selected,
                    ...input,
                  })
                }
              />
            ) : null}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function PlayerButton({
  active,
  name,
  detail,
  isActive,
  onClick,
}: {
  active: boolean;
  name: string;
  detail: string;
  isActive?: boolean;
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
        {isActive !== undefined && (
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "启用" : "停用"}
          </Badge>
        )}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}

function BuiltinPlayerForm({
  player,
  busy,
  error,
  onSubmit,
}: {
  player?: AdminBuiltinPlayer;
  busy: boolean;
  error: Error | null;
  onSubmit: (input: CreateBuiltinPlayerInput) => void;
}) {
  const [name, setName] = useState(player?.name ?? "");
  const [sourceCode, setSourceCode] = useState(
    player?.latestVersion.sourceCode ?? "",
  );
  const [isActive, setIsActive] = useState(player?.isActive ?? true);
  const [weight, setWeight] = useState(String(player?.weight ?? 1));
  const parsedWeight = Number(weight);
  const changed =
    player === undefined ||
    name !== player.name ||
    sourceCode !== player.latestVersion.sourceCode ||
    isActive !== player.isActive ||
    parsedWeight !== player.weight;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ name, sourceCode, isActive, weight: parsedWeight });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup className="p-6">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="builtin-name">程序名称</FieldLabel>
            <Input
              id="builtin-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={1}
              maxLength={64}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="builtin-weight">评分权重</FieldLabel>
            <Input
              id="builtin-weight"
              type="number"
              min={1}
              step={1}
              value={weight}
              onChange={(event) => setWeight(event.currentTarget.value)}
              required
            />
          </Field>
          <Field orientation="horizontal" className="w-auto sm:h-9">
            <Switch
              id="builtin-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <FieldLabel htmlFor="builtin-active">用于新提交评测</FieldLabel>
          </Field>
        </div>

        {player !== undefined && (
          <div className="flex flex-wrap gap-2">
            <Badge>CPP</Badge>
            <Badge variant="secondary">
              当前 v{player.latestVersion.version}
            </Badge>
            <Badge variant="secondary">共 {player.versionCount} 个版本</Badge>
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="builtin-source">C++ 源码</FieldLabel>
          <CodeEditor
            id="builtin-source"
            value={sourceCode}
            onChange={setSourceCode}
            ariaLabel="C++ 源码"
            required
          />
        </Field>
      </FieldGroup>

      <div className="flex flex-col items-stretch gap-4 border-t p-6 sm:flex-row sm:items-center sm:justify-end">
        {error !== null && (
          <Alert className="sm:mr-auto" variant="destructive">
            <AlertTitle>保存失败</AlertTitle>
            <AlertDescription>
              {error instanceof ApiError ? error.message : "请稍后重试"}
            </AlertDescription>
          </Alert>
        )}
        <Button
          className="shrink-0"
          type="submit"
          disabled={busy || !changed || sourceCode.trim().length === 0}
        >
          {busy && (
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
          )}
          {busy
            ? "正在保存…"
            : player === undefined
              ? "创建内置程序"
              : sourceCode !== player.latestVersion.sourceCode
                ? "保存并创建新版本"
                : "保存设置"}
        </Button>
      </div>
    </form>
  );
}
