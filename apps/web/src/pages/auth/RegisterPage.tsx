import { useMutation } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { ApiError, register } from "../../lib/api";
import { usePageTitle } from "../../lib/use-page-title";

export function RegisterPage() {
  usePageTitle("注册");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () => register({ username, displayName, email, password }),
    onSuccess: (user) =>
      navigate("/verify-email", { state: { username: user.username } }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setClientError("两次输入的密码不一致");
      return;
    }
    setClientError(null);
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>申请账号</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="display-name">显示名称</FieldLabel>
              <Input
                id="display-name"
                minLength={2}
                maxLength={40}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="register-username">用户名</FieldLabel>
              <Input
                id="register-username"
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
              <FieldDescription>3–32 位字母、数字或下划线</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="register-email">邮箱</FieldLabel>
              <Input
                id="register-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <FieldDescription>
                仅支持主流邮箱（如 Gmail、QQ、163、126）
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="register-password">密码</FieldLabel>
              <Input
                id="register-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <FieldDescription>
                至少 8 位，并同时包含字母和数字
              </FieldDescription>
            </Field>
            <Field data-invalid={clientError !== null || undefined}>
              <FieldLabel htmlFor="password-confirmation">确认密码</FieldLabel>
              <Input
                id="password-confirmation"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-invalid={clientError !== null || undefined}
                required
              />
              <FieldError>{clientError}</FieldError>
            </Field>
            {mutation.isError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>注册失败</AlertTitle>
                <AlertDescription>
                  {mutation.error instanceof ApiError
                    ? mutation.error.message
                    : "注册失败，请稍后重试"}
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
                {mutation.isPending ? "正在提交…" : "提交注册申请"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-center gap-1">
        <span className="text-sm text-muted-foreground">已有账号？</span>
        <Button asChild className="h-auto p-0" variant="link">
          <Link to="/login">登录</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
