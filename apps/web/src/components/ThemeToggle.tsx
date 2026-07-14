import { Moon, Sun } from "lucide-react";

import { useTheme } from "../lib/theme";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "light" ? "暗色" : "浅色";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={`切换为${nextTheme}模式`}
          size="icon"
          variant="ghost"
          onClick={toggleTheme}
        >
          {theme === "light" ? <Moon /> : <Sun />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">切换为{nextTheme}模式</TooltipContent>
    </Tooltip>
  );
}
