import type { AdminUser, ReviewUserInput } from "@compintel/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, UserRound, X } from "lucide-react";

import { PageTitle } from "../../components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import { ApiError, getAdminUsers, reviewUser } from "../../lib/api";
import { usePageTitle } from "../../lib/use-page-title";

const usersQueryKey = ["admin", "users"] as const;

export function AdminUsersPage() {
  usePageTitle("用户审核");
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: usersQueryKey,
    queryFn: ({ signal }) => getAdminUsers(signal),
  });
  const review = useMutation({
    mutationFn: ({
      userId,
      decision,
    }: {
      userId: string;
      decision: ReviewUserInput["decision"];
    }) => reviewUser(userId, { decision }),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminUser[]>(usersQueryKey, (current) =>
        current?.map((user) => (user.id === updated.id ? updated : user)),
      );
    },
  });

  const pendingCount =
    users.data?.filter(
      (user) => user.approvalStatus === "PENDING" && user.emailVerified,
    ).length ?? 0;

  return (
    <section className="py-10 sm:py-12">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle>用户审核</PageTitle>
        <Badge variant={pendingCount > 0 ? "default" : "secondary"}>
          {pendingCount} 个待审核
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
          <div className="hidden grid-cols-[minmax(180px,1fr)_140px_160px_240px] bg-muted/50 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>用户</span>
            <span>身份</span>
            <span>状态</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y">
            {users.data.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                busy={review.isPending && review.variables?.userId === user.id}
                onReview={(decision) =>
                  review.mutate({ userId: user.id, decision })
                }
              />
            ))}
          </div>
          {review.isError && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertTitle>审核操作失败</AlertTitle>
                <AlertDescription>
                  {review.error instanceof ApiError
                    ? review.error.message
                    : "请稍后重试"}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}

function UserRow({
  user,
  busy,
  onReview,
}: {
  user: AdminUser;
  busy: boolean;
  onReview: (decision: ReviewUserInput["decision"]) => void;
}) {
  return (
    <article className="grid min-h-24 grid-cols-1 items-center gap-3 px-5 py-4 lg:grid-cols-[minmax(180px,1fr)_140px_160px_240px] lg:gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.displayName}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          @{user.username}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {user.email}
          {!user.emailVerified ? " · 未验证" : ""}
        </p>
      </div>
      <div>
        <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
          {user.role === "ADMIN" ? "管理员" : "用户"}
        </Badge>
      </div>
      <div>
        <ApprovalBadge
          status={user.approvalStatus}
          emailVerified={user.emailVerified}
        />
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {user.role === "USER" && (
          <>
            <Button
              size="sm"
              disabled={
                busy ||
                !user.emailVerified ||
                user.approvalStatus === "REJECTED"
              }
              variant="outline"
              onClick={() => onReview("REJECT")}
            >
              <X data-icon="inline-start" />
              拒绝
            </Button>
            <Button
              size="sm"
              disabled={
                busy ||
                !user.emailVerified ||
                user.approvalStatus === "APPROVED"
              }
              onClick={() => onReview("APPROVE")}
            >
              {busy ? (
                <LoaderCircle
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {busy ? "处理中…" : "通过"}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function ApprovalBadge({
  status,
  emailVerified,
}: {
  status: AdminUser["approvalStatus"];
  emailVerified: boolean;
}) {
  if (!emailVerified) return <Badge variant="secondary">待验证邮箱</Badge>;
  if (status === "APPROVED") return <Badge>已通过</Badge>;
  if (status === "REJECTED") {
    return <Badge variant="destructive">已拒绝</Badge>;
  }
  return <Badge variant="secondary">待审核</Badge>;
}
