import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "../lib/theme";
import { ThemeToggle } from "./ThemeToggle";
import { TooltipProvider } from "./ui/tooltip";

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("uses light mode by default and persists a dark-mode switch", async () => {
    render(
      <ThemeProvider>
        <TooltipProvider>
          <ThemeToggle />
        </TooltipProvider>
      </ThemeProvider>,
    );

    const toggle = screen.getByRole("button", { name: "切换为暗色模式" });
    expect(document.documentElement).not.toHaveClass("dark");

    await userEvent.click(toggle);

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("compintel-theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "切换为浅色模式" }),
    ).toBeInTheDocument();
  });
});
