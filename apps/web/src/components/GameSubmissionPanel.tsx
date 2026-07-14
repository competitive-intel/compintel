import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, getPlayerNames, submitPlayer } from "../lib/api";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Combobox } from "./ui/combobox";
import { CodeEditor } from "./CodeEditor";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";

export function GameSubmissionPanel({ gameSlug }: { gameSlug: string }) {
  const [name, setName] = useState("");
  const [sourceCode, setSourceCode] = useState("");
  const playerNames = useQuery({
    queryKey: ["games", gameSlug, "player-names"],
    queryFn: ({ signal }) => getPlayerNames(gameSlug, signal),
  });
  const submission = useMutation({
    mutationFn: () => submitPlayer(gameSlug, { name, sourceCode }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submission.mutate();
  }

  return (
    <section id="submit" className="flex scroll-mt-24 flex-col gap-5">
      <h2 className="text-xl font-semibold">提交</h2>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="submission-name">AI 名称</FieldLabel>
            <Combobox
              id="submission-name"
              value={name}
              options={playerNames.data ?? []}
              onValueChange={setName}
              maxLength={64}
              placeholder="选择已有名称或输入新名称"
              searchPlaceholder="输入或搜索 Player 名称…"
              emptyText="尚未使用过 Player 名称"
              groupLabel="已用名称"
              required
            />
            <FieldDescription>
              {playerNames.isPending
                ? "正在加载已用名称…"
                : playerNames.isError
                  ? "名称建议加载失败，仍可手动输入。"
                  : "选择已用名称会自动创建下一版本；新名称会创建版本 1。"}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="submission-source">程序代码</FieldLabel>
            <CodeEditor
              id="submission-source"
              value={sourceCode}
              onChange={setSourceCode}
              ariaLabel="程序代码"
              required
            />
          </Field>

          {submission.isSuccess && (
            <Alert role="status">
              <CircleCheck />
              <AlertTitle>提交成功</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>提交已受理，可查看评测详情。</span>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/submissions/${submission.data.playerVersionId}`}>
                    查看评测详情
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {submission.isError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>提交失败</AlertTitle>
              <AlertDescription>
                {submission.error instanceof ApiError
                  ? submission.error.message
                  : "提交失败，请稍后重试"}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                submission.isPending ||
                name.trim().length === 0 ||
                sourceCode.trim().length === 0
              }
            >
              {submission.isPending && (
                <LoaderCircle
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {submission.isPending ? "正在提交…" : "提交程序"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
