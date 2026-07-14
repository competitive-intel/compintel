import { CircleAlert, LoaderCircle } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { ApiError } from "../lib/api";
import { useCurrentUser } from "../lib/auth";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

export function ProtectedRoute() {
  const location = useLocation();
  const currentUser = useCurrentUser();

  if (currentUser.isPending) return <RouteLoading />;
  if (currentUser.isError) {
    if (
      currentUser.error instanceof ApiError &&
      currentUser.error.status === 401
    ) {
      return (
        <Navigate replace to="/login" state={{ from: location.pathname }} />
      );
    }
    return (
      <RouteMessage
        title="暂时无法加载账号"
        detail="请检查网络连接后刷新页面。"
      />
    );
  }
  return <Outlet />;
}

export function AdministratorRoute() {
  const currentUser = useCurrentUser();
  if (currentUser.isPending) return <RouteLoading />;
  if (currentUser.data?.role !== "ADMIN") return <Navigate replace to="/" />;
  return <Outlet />;
}

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
      <LoaderCircle className="animate-spin" />
      <span>正在确认登录状态…</span>
    </div>
  );
}

function RouteMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <Alert className="max-w-md" variant="destructive">
        <CircleAlert />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{detail}</AlertDescription>
      </Alert>
    </div>
  );
}
