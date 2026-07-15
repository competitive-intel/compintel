import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Gamepad2,
  LogOut,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { logout } from "../lib/api";
import { currentUserQueryKey, useCurrentUser } from "../lib/auth";
import { cn } from "../lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-secondary text-secondary-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  );

export function AppShell() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: currentUserQueryKey });
      navigate("/login", { replace: true });
    },
  });
  const isAdmin = currentUser.data?.role === "ADMIN";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <NavLink
            aria-label="CompIntel 首页"
            className="flex shrink-0 items-center gap-3"
            to="/games"
          >
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-md bg-foreground text-xs font-semibold text-background"
            >
              CI
            </span>
            <span className="text-base font-semibold">CompIntel</span>
          </NavLink>

          <nav
            aria-label="主导航"
            className="hidden items-center gap-1 md:flex"
          >
            <NavLink className={navLinkClassName} to="/games">
              游戏
            </NavLink>
            {isAdmin && (
              <>
                <NavLink className={navLinkClassName} to="/admin/games">
                  游戏管理
                </NavLink>
                <NavLink className={navLinkClassName} to="/admin/users">
                  用户审核
                </NavLink>
                <NavLink className={navLinkClassName} to="/admin/settings">
                  系统设置
                </NavLink>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <div className="mr-2 hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">
                {currentUser.data?.displayName}
              </p>
              <p className="text-xs text-muted-foreground">
                @{currentUser.data?.username}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="打开用户菜单" size="icon" variant="outline">
                  <UserRound />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="sm:hidden">
                    <span className="block truncate">
                      {currentUser.data?.displayName}
                    </span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      @{currentUser.data?.username}
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="sm:hidden" />
                <DropdownMenuGroup className="md:hidden">
                  <DropdownMenuItem asChild>
                    <NavLink to="/games">
                      <Gamepad2 />
                      游戏
                    </NavLink>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuItem asChild>
                        <NavLink to="/admin/games">
                          <Settings />
                          游戏管理
                        </NavLink>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <NavLink to="/admin/users">
                          <ShieldCheck />
                          用户审核
                        </NavLink>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <NavLink to="/admin/settings">
                          <SlidersHorizontal />
                          系统设置
                        </NavLink>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="md:hidden" />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={logoutMutation.isPending}
                    onSelect={() => logoutMutation.mutate()}
                  >
                    <LogOut />
                    {logoutMutation.isPending ? "正在退出…" : "退出登录"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
