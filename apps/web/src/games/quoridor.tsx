import type { QuoridorReplay } from "@compintel/contracts";
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
import { Button } from "../components/ui/button";

export function QuoridorReplayBoard({ replay }: { replay: QuoridorReplay }) {
  const totalMoves = replay.moves.length;
  const [visibleMoveCount, setVisibleMoveCount] = useState(totalMoves);
  const [isPlaying, setIsPlaying] = useState(false);
  const visibleMoves = replay.moves.slice(0, visibleMoveCount);
  const pawns: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: 4, y: 0 },
    { x: 4, y: 8 },
  ];
  const walls = visibleMoves.filter((move) => move.type === 1);
  for (const move of visibleMoves) {
    if (move.type === 0) pawns[move.seat] = { x: move.x, y: move.y };
  }

  useEffect(() => {
    setVisibleMoveCount(replay.moves.length);
    setIsPlaying(false);
  }, [replay]);

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
          value={
            replay.userSeat === 0 ? "红方（先手，向下）" : "蓝方（后手，向上）"
          }
        />
        <ReplayFact label="总步数" value={String(totalMoves)} />
        <ReplayFact label="规则结果" value={replayResultText(replay)} />
      </dl>

      <div className="mx-auto w-full max-w-2xl">
        <div
          className="relative grid aspect-square w-full overflow-hidden rounded-md border bg-muted p-3 sm:p-5"
          style={{
            gridTemplateColumns:
              "repeat(8, minmax(0, 1fr) 0.4rem) minmax(0, 1fr)",
            gridTemplateRows: "repeat(8, minmax(0, 1fr) 0.4rem) minmax(0, 1fr)",
          }}
          role="img"
          aria-label={
            visibleMoveCount === totalMoves
              ? "路墙棋对局终局棋盘"
              : `路墙棋对局棋盘，第 ${visibleMoveCount} 步，共 ${totalMoves} 步`
          }
        >
          {Array.from({ length: 81 }, (_, index) => {
            const x = index % 9;
            const y = Math.floor(index / 9);
            const pawnSeat = pawns.findIndex(
              (pawn) => pawn.x === x && pawn.y === y,
            );
            return (
              <span
                key={`${x}:${y}`}
                className="grid min-h-0 min-w-0 place-items-center rounded-xs border bg-background shadow-xs"
                style={{ gridColumn: x * 2 + 1, gridRow: y * 2 + 1 }}
                data-board-cell={`${x}:${y}`}
              >
                {pawnSeat >= 0 && (
                  <span
                    className={cn(
                      "size-[72%] max-h-full max-w-full rounded-full border-2 border-background shadow-sm ring-1 ring-foreground/15",
                      pawnSeat === 0 ? "bg-player-red" : "bg-player-blue",
                    )}
                    title={`${pawnSeat === 0 ? "红方（先手）" : "蓝方（后手）"}棋子：(${x}, ${y})`}
                    data-pawn-seat={pawnSeat}
                  />
                )}
              </span>
            );
          })}
          {walls.map((wall, index) => (
            <span
              key={`${wall.x}:${wall.y}:${wall.orientation}`}
              className={cn(
                "rounded-full shadow-sm ring-1 ring-foreground/15",
                wall.seat === 0 ? "bg-player-red" : "bg-player-blue",
              )}
              style={
                wall.orientation === 0
                  ? {
                      gridColumn: wall.x * 2,
                      gridRow: `${wall.y * 2 - 1} / span 3`,
                    }
                  : {
                      gridColumn: `${wall.x * 2 - 1} / span 3`,
                      gridRow: wall.y * 2,
                    }
              }
              title={`第 ${visibleMoves.indexOf(wall) + 1} 步：${wall.seat === 0 ? "红方" : "蓝方"}${wall.orientation === 0 ? "竖墙" : "横墙"} (${wall.x}, ${wall.y})`}
              data-wall={index}
              data-wall-seat={wall.seat}
            />
          ))}
          {visibleMoveCount === totalMoves && replay.result.type === "win" && (
            <div
              className="pointer-events-none absolute inset-0 grid place-items-center bg-background/15 backdrop-blur-[3px]"
              data-game-result-overlay
            >
              <span
                className={cn(
                  "text-xl drop-shadow-md sm:text-3xl",
                  replay.result.winner === 0
                    ? "text-player-red"
                    : "text-player-blue",
                )}
              >
                {replay.result.winner === 0 ? "红方获胜" : "蓝方获胜"}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <ReplayButton
          label="回到开局"
          disabled={visibleMoveCount === 0}
          onClick={() => showMove(0)}
          icon={<SkipBackIcon />}
        />
        <ReplayButton
          label="上一步"
          disabled={visibleMoveCount === 0}
          onClick={() => showMove(visibleMoveCount - 1)}
          icon={<ChevronLeftIcon />}
        />
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
        <ReplayButton
          label="下一步"
          disabled={visibleMoveCount === totalMoves}
          onClick={() => showMove(visibleMoveCount + 1)}
          icon={<ChevronRightIcon />}
        />
        <ReplayButton
          label="跳到终局"
          disabled={visibleMoveCount === totalMoves}
          onClick={() => showMove(totalMoves)}
          icon={<SkipForwardIcon />}
        />
        <span className="min-w-20 text-center text-sm tabular-nums text-muted-foreground">
          {visibleMoveCount} / {totalMoves} 步
        </span>
      </div>
    </div>
  );
}

function ReplayButton({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {icon}
    </Button>
  );
}

function ReplayFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word font-medium">{value}</dd>
    </div>
  );
}

function replayResultText(replay: QuoridorReplay): string {
  if (replay.result.type === "playing") return "异常中止";
  if (replay.result.type === "move_limit") return "步数上限，你的程序判负";
  return replay.result.winner === replay.userSeat
    ? "你的程序获胜"
    : "平台程序获胜";
}
