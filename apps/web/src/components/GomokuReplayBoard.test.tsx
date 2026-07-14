import { fireEvent, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { replayFixture } from "../test/fixtures";
import { renderWithProviders } from "../test/render";
import { GomokuReplayBoard } from "./GomokuReplayBoard";

describe("GomokuReplayBoard", () => {
  it("renders board dimensions, seats, moves, and the final move", () => {
    const { container } = renderWithProviders(
      <GomokuReplayBoard replay={replayFixture()} />,
    );

    expect(screen.getByText("白方（先手）")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("你的程序获胜")).toBeInTheDocument();
    expect(container.querySelectorAll('[title^="第 "]')).toHaveLength(3);
    expect(screen.getByTitle("第 3 步：(2, 0)")).toContainElement(
      container.querySelector('[data-last-move="true"]'),
    );
    expect(screen.getByRole("img")).toHaveStyle({
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    });
    expect(container.querySelector('[data-board-cell="0:0"]')).toHaveClass(
      "border-l",
      "border-t",
    );
    expect(screen.getByText("3 / 3 步")).toBeInTheDocument();
  });

  it("steps through the replay and automatically plays from the beginning", () => {
    vi.useFakeTimers();
    const { container } = renderWithProviders(
      <GomokuReplayBoard replay={replayFixture()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(container.querySelectorAll('[title^="第 "]')).toHaveLength(2);
    expect(screen.getByText("2 / 3 步")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "跳到终局" }));
    fireEvent.click(screen.getByRole("button", { name: "自动播放" }));
    expect(container.querySelectorAll('[title^="第 "]')).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "暂停自动播放" }),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(700));
    expect(container.querySelectorAll('[title^="第 "]')).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1_400));
    expect(container.querySelectorAll('[title^="第 "]')).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "自动播放" }),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it.each([
    [{ type: "win", winner: 0 } as const, 1 as const, "平台程序获胜"],
    [{ type: "draw" } as const, 0 as const, "平局"],
    [{ type: "playing" } as const, 0 as const, "异常中止"],
  ])("renders result %#", (result, userSeat, label) => {
    renderWithProviders(
      <GomokuReplayBoard replay={replayFixture({ result, userSeat })} />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders an empty board without a final-move marker", () => {
    const { container } = renderWithProviders(
      <GomokuReplayBoard
        replay={replayFixture({ moves: [], result: { type: "playing" } })}
      />,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(
      container.querySelector('[data-last-move="true"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自动播放" })).toBeDisabled();
  });
});
