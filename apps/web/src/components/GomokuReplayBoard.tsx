import type { GomokuReplay } from "@compintel/contracts";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export function GomokuReplayBoard({ replay }: { replay: GomokuReplay }) {
  const totalMoves = replay.moves.length;
  const [visibleMoveCount, setVisibleMoveCount] = useState(totalMoves);
  const [isPlaying, setIsPlaying] = useState(false);
  const visibleMoves = replay.moves.slice(0, visibleMoveCount);
  const stones = new Map(
    visibleMoves.map((move, index) => [
      `${move.x}:${move.y}`,
      { ...move, index },
    ]),
  );
  const lastMoveIndex = visibleMoveCount - 1;

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setVisibleMoveCount((current) => {
        if (current >= totalMoves - 1) {
          setIsPlaying(false);
          return totalMoves;
        }
        return current + 1;
      });
    }, 700);

    return () => window.clearInterval(timer);
  }, [isPlaying, totalMoves]);

  function showMove(count: number) {
    setIsPlaying(false);
    setVisibleMoveCount(Math.min(totalMoves, Math.max(0, count)));
  }

  function togglePlayback() {
    if (totalMoves === 0) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (visibleMoveCount === totalMoves) setVisibleMoveCount(0);
    setIsPlaying(true);
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <ReplayFact
          label="你的席位"
          value={replay.userSeat === 0 ? "白方（先手）" : "黑方（后手）"}
        />
        <ReplayFact label="总步数" value={String(replay.moves.length)} />
        <ReplayFact label="规则结果" value={replayResultText(replay)} />
      </dl>

      <div className="mx-auto w-full max-w-2xl">
        <div
          className="grid aspect-square w-full overflow-hidden rounded-md border bg-muted p-2 sm:p-3"
          style={{
            gridTemplateColumns: `repeat(${replay.width}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${replay.height}, minmax(0, 1fr))`,
          }}
          role="img"
          aria-label={
            visibleMoveCount === totalMoves
              ? "对局终局棋盘"
              : `对局棋盘，第 ${visibleMoveCount} 步，共 ${totalMoves} 步`
          }
        >
          {Array.from({ length: replay.width * replay.height }, (_, index) => {
            const x = index % replay.width;
            const y = Math.floor(index / replay.width);
            const stone = stones.get(`${x}:${y}`);
            return (
              <span
                className={cn(
                  "relative grid min-h-0 min-w-0 place-items-center border-r border-b border-foreground/20",
                  x === 0 && "border-l",
                  y === 0 && "border-t",
                )}
                key={`${x}:${y}`}
                data-board-cell={`${x}:${y}`}
              >
                {stone && (
                  <span
                    className={cn(
                      "grid size-[72%] max-h-full max-w-full place-items-center rounded-full shadow-sm",
                      stone.seat === 0
                        ? "border border-black/20 bg-white"
                        : "bg-black",
                    )}
                    title={`第 ${stone.index + 1} 步：(${x}, ${y})`}
                  >
                    {stone.index === lastMoveIndex && (
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          stone.seat === 0 ? "bg-black" : "bg-white",
                        )}
                        data-last-move="true"
                      />
                    )}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => showMove(0)}
          disabled={visibleMoveCount === 0}
          aria-label="回到开局"
          title="回到开局"
        >
          <SkipBackIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => showMove(visibleMoveCount - 1)}
          disabled={visibleMoveCount === 0}
          aria-label="上一步"
          title="上一步"
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          onClick={togglePlayback}
          disabled={totalMoves === 0}
          aria-label={isPlaying ? "暂停自动播放" : "自动播放"}
        >
          {isPlaying ? (
            <PauseIcon data-icon="inline-start" />
          ) : (
            <PlayIcon data-icon="inline-start" />
          )}
          {isPlaying ? "暂停" : "播放"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => showMove(visibleMoveCount + 1)}
          disabled={visibleMoveCount === totalMoves}
          aria-label="下一步"
          title="下一步"
        >
          <ChevronRightIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => showMove(totalMoves)}
          disabled={visibleMoveCount === totalMoves}
          aria-label="跳到终局"
          title="跳到终局"
        >
          <SkipForwardIcon />
        </Button>
        <span className="min-w-20 text-center text-sm tabular-nums text-muted-foreground">
          {visibleMoveCount} / {totalMoves} 步
        </span>
      </div>
    </div>
  );
}

function ReplayFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function replayResultText(replay: GomokuReplay): string {
  if (replay.result.type === "draw") return "平局";
  if (replay.result.type === "playing") return "异常中止";
  if (replay.result.winner === replay.userSeat) return "你的程序获胜";
  return "平台程序获胜";
}
