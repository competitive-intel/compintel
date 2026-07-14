import type { GameResourceLimits } from "@compintel/contracts";

import { Badge } from "./ui/badge";

export function ResourceLimitBadges({
  limits,
}: {
  limits: GameResourceLimits;
}) {
  return (
    <div aria-label="评测资源限制" className="flex flex-wrap gap-2">
      <Badge variant="outline">
        单步 CPU {formatMilliseconds(limits.moveCpuLimitMs)}
      </Badge>
      <Badge variant="outline">
        总 CPU {formatMilliseconds(limits.totalCpuLimitMs)}
      </Badge>
      <Badge variant="outline">内存 {limits.memoryLimitMiB} MiB</Badge>
    </div>
  );
}

function formatMilliseconds(milliseconds: number): string {
  if (milliseconds >= 1_000 && milliseconds % 1_000 === 0) {
    return `${milliseconds / 1_000} s`;
  }
  return `${milliseconds} ms`;
}
