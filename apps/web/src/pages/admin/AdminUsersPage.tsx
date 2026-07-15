import type { AdminUser } from "@compintel/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, LoaderCircle, UserRound } from "lucide-react";

import { PageTitle } from "../../components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { ApiError, banUser, getAdminUsers, unbanUser } from "../../lib/api";
import { usePageTitle } from "../../lib/use-page-title";

const usersQueryKey = ["admin", "users"] as const;

export function AdminUsersPage() {
  usePageTitle("用户管理");
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: usersQueryKey,
    queryFn: ({ signal }) => getAdminUsers(signal),
  });
  const ban = useMutation({
    mutationFn: (userId: string) => banUser(userId),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminUser[]>(usersQueryKey, (current) =>
        current?.map((user) => (user.id === updated.id ? updated : user)),
      );
    },
  });
  const unban = useMutation({
    mutationFn: (userId: string) => unbanUser(userId),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminUser[]>(usersQueryKey, (current) =>
        current?.map((user) => (user.id === updated.id ? updated : user)),
      );
    },
  });

  const bannedCount =
    users.data?.filter((user) => user.role === "BANNED").length ?? 0;
  const actionError = ban.error ?? unban.error;
  const actionPending = ban.isPending || unban.isPending;
  const actionUserId = ban.isPending
    ? ban.variables
    : unban.isPending
      ? unban.variables
      : undefined;

  return (
    <section className="py-10 sm:py-12">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle>用户管理</PageTitle>
        <Badge variant={bannedCount > 0 ? "destructive" : "secondary"}>
          {bannedCount} 个已封禁
        </Badge>
      </header>

      {users.isPending && (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="animate-spin" />
          正在加载用户…
        </div>
      )}
      {users.isError && (
        <Alert variant="destructive">
          <AlertTitle>用户列表加载失败</AlertTitle>
          <AlertDescription>
            {users.error instanceof ApiError
              ? users.error.message
              : "请稍后重试"}
          </AlertDescription>
        </Alert>
      )}
      {users.data !== undefined && users.data.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserRound />
            </EmptyMedia>
            <EmptyTitle>暂无注册用户</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {users.data !== undefined && users.data.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table className="min-w-190">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 px-4">用户</TableHead>
                  <TableHead className="h-9 w-[8rem]">用户名</TableHead>
                  <TableHead className="h-9 w-[6.5rem]">角色</TableHead>
                  <TableHead className="h-9 w-[7rem]">总提交次数</TableHead>
                  <TableHead className="h-9 w-[7.5rem] px-4 text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    busy={actionPending && actionUserId === user.id}
                    onBan={() => {
                      unban.reset();
                      ban.mutate(user.id);
                    }}
                    onUnban={() => {
                      ban.reset();
                      unban.mutate(user.id);
                    }}
                  />
                ))}
              </TableBody>
            </Table>
            {actionError && (
              <div className="border-t p-3">
                <Alert variant="destructive">
                  <AlertTitle>操作失败</AlertTitle>
                  <AlertDescription>
                    {actionError instanceof ApiError
                      ? actionError.message
                      : "请稍后重试"}
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function UserRow({
  user,
  busy,
  onBan,
  onUnban,
}: {
  user: AdminUser;
  busy: boolean;
  onBan: () => void;
  onUnban: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.email}
            {!user.emailVerified ? " · 未验证" : ""}
          </p>
        </div>
      </TableCell>
      <TableCell className="py-2.5 text-muted-foreground">
        @{user.username}
      </TableCell>
      <TableCell className="py-2.5">
        <RoleBadge role={user.role} />
      </TableCell>
      <TableCell className="py-2.5 tabular-nums">
        {user.submissionCount}
      </TableCell>
      <TableCell className="px-4 py-2.5 text-right">
        {user.role === "USER" && (
          <Button size="sm" disabled={busy} variant="outline" onClick={onBan}>
            {busy ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Ban data-icon="inline-start" />
            )}
            {busy ? "处理中…" : "封禁"}
          </Button>
        )}
        {user.role === "BANNED" && (
          <Button size="sm" disabled={busy} onClick={onUnban}>
            {busy ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : null}
            {busy ? "处理中…" : "解封"}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function RoleBadge({ role }: { role: AdminUser["role"] }) {
  if (role === "ADMIN") return <Badge>管理员</Badge>;
  if (role === "BANNED") {
    return <Badge variant="destructive">已封禁</Badge>;
  }
  return <Badge variant="secondary">用户</Badge>;
}
