import { Link, Outlet } from "react-router-dom";

import { AppFooter } from "./AppFooter";
import { ThemeToggle } from "./ThemeToggle";

export function AuthLayout() {
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr_auto] bg-background">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Link className="flex items-center gap-3" to="/">
          <span className="grid size-8 place-items-center rounded-md bg-foreground text-xs font-semibold text-background">
            CI
          </span>
          <span className="text-base font-semibold">CompIntel</span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="grid place-items-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
