import { useMutation } from "@tanstack/react-query";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { ApiError, resendVerification, verifyEmail } from "../../lib/api";
import { usePageTitle } from "../../lib/use-page-title";

export function VerifyEmailPage() {
  usePageTitle("验证邮箱");
  const location = useLocation();
  const navigate = useNavigate();
  const initialUsername =
    (location.state as { username?: string } | null)?.username ?? "";
  const [username, setUsername] = useState(initialUsername);
  const [code, setCode] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const verifyMutation = useMutation({
    mutationFn: () => verifyEmail({ username, code }),
    onSuccess: (user) =>
      navigate("/pending", { state: { username: user.username } }),
  });

  const resendMutation = useMutation({
    mutationFn: () => resendVerification({ username }),
    onSuccess: () => {
      setResendMessage("验证码已重新发送，请查收邮箱。");
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResendMessage(null);
    verifyMutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>验证邮箱</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="verify-username">用户名</FieldLabel>
              <Input
                id="verify-username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="verify-code">验证码</FieldLabel>
              <Input
                id="verify-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
              <FieldDescription>
                请输入发送到注册邮箱的 6 位验证码
              </FieldDescription>
            </Field>
            {verifyMutation.isError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>验证失败</AlertTitle>
                <AlertDescription>
                  {verifyMutation.error instanceof ApiError
                    ? verifyMutation.error.message
                    : "验证失败，请稍后重试"}
                </AlertDescription>
              </Alert>
            )}
            {resendMutation.isError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>发送失败</AlertTitle>
                <AlertDescription>
                  {resendMutation.error instanceof ApiError
                    ? resendMutation.error.message
                    : "发送失败，请稍后重试"}
                </AlertDescription>
              </Alert>
            )}
            {resendMessage !== null && (
              <Alert>
                <AlertTitle>已发送</AlertTitle>
                <AlertDescription>{resendMessage}</AlertDescription>
              </Alert>
            )}
            <Field>
              <Button
                className="w-full"
                type="submit"
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending && (
                  <LoaderCircle
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {verifyMutation.isPending ? "正在验证…" : "验证邮箱"}
              </Button>
            </Field>
            <Field>
              <Button
                className="w-full"
                type="button"
                variant="outline"
                disabled={
                  resendMutation.isPending || username.trim().length === 0
                }
                onClick={() => {
                  setResendMessage(null);
                  resendMutation.mutate();
                }}
              >
                {resendMutation.isPending && (
                  <LoaderCircle
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {resendMutation.isPending ? "正在发送…" : "重新发送验证码"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-center gap-1">
        <span className="text-sm text-muted-foreground">已完成验证？</span>
        <Button asChild className="h-auto p-0" variant="link">
          <Link to="/login">去登录</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
