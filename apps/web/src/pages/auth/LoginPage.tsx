import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { ApiError, login } from "../../lib/api";
import { currentUserQueryKey } from "../../lib/auth";
import { usePageTitle } from "../../lib/use-page-title";

export function LoginPage() {
  usePageTitle("登录");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => login({ username, password }),
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserQueryKey, user);
      const from = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(from, { replace: true });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录平台</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="username">用户名</FieldLabel>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">密码</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            {mutation.isError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>登录失败</AlertTitle>
                <AlertDescription>
                  {loginErrorMessage(mutation.error)}
                </AlertDescription>
              </Alert>
            )}
            <Field>
              <Button
                className="w-full"
                type="submit"
                disabled={mutation.isPending}
              >
                {mutation.isPending && (
                  <LoaderCircle
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {mutation.isPending ? "正在登录…" : "登录"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-center gap-1">
        <span className="text-sm text-muted-foreground">还没有账号？</span>
        <Button asChild className="h-auto p-0" variant="link">
          <Link to="/register">注册账号</Link>
        </Button>
        {mutation.isError &&
          mutation.error instanceof ApiError &&
          mutation.error.code === "EMAIL_UNVERIFIED" && (
            <>
              <span className="text-sm text-muted-foreground">·</span>
              <Button asChild className="h-auto p-0" variant="link">
                <Link to="/verify-email" state={{ username }}>
                  去验证邮箱
                </Link>
              </Button>
            </>
          )}
      </CardFooter>
    </Card>
  );
}

function loginErrorMessage(error: Error): string {
  if (!(error instanceof ApiError)) return "登录失败，请稍后重试";
  if (error.code === "EMAIL_UNVERIFIED") return "请先完成邮箱验证后再登录。";
  if (error.code === "ACCOUNT_BANNED") return "账号已被封禁，请联系管理员。";
  return error.message;
}
