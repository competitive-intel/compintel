import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/render";
import { QuoridorReplayBoard } from "./quoridor";
import { quoridorReplayFixture } from "./quoridor.test-fixtures";

describe("QuoridorReplayBoard", () => {
  it("renders red and blue pawns and owner-colored walls", () => {
    const { container } = renderWithProviders(
      <QuoridorReplayBoard replay={quoridorReplayFixture()} />,
    );
    expect(screen.getByText("红方（先手，向下）")).toBeInTheDocument();
    expect(screen.getByText("你的程序获胜")).toBeInTheDocument();
    expect(screen.getByTitle("红方（先手）棋子：(4, 1)")).toHaveClass(
      "bg-player-red",
    );
    expect(screen.getByTitle("蓝方（后手）棋子：(4, 8)")).toHaveClass(
      "bg-player-blue",
    );
    expect(screen.queryByText("♟")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-wall]")).toHaveLength(2);
    expect(container.querySelector('[data-wall-seat="0"]')).toHaveClass(
      "bg-player-red",
    );
    expect(container.querySelector('[data-wall-seat="1"]')).toHaveClass(
      "bg-player-blue",
    );
    expect(screen.getByText("红方获胜")).toHaveClass("text-player-red");
    expect(screen.getByText("红方获胜")).not.toHaveClass("bg-player-red");
    expect(container.querySelector("[data-game-result-overlay]")).toHaveClass(
      "backdrop-blur-[3px]",
    );
    expect(screen.getByRole("img")).toHaveAccessibleName("路墙棋对局终局棋盘");
  });

  it("shows the blue winner on the final position", () => {
    renderWithProviders(
      <QuoridorReplayBoard
        replay={quoridorReplayFixture({
          result: { type: "win", winner: 1 },
        })}
      />,
    );
    expect(screen.getByText("蓝方获胜")).toHaveClass("text-player-blue");
    expect(screen.getByText("蓝方获胜")).not.toHaveClass("bg-player-blue");
    expect(screen.queryByText("红方获胜")).not.toBeInTheDocument();
  });

  it("steps back through pawn and wall actions", () => {
    const { container } = renderWithProviders(
      <QuoridorReplayBoard replay={quoridorReplayFixture()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(container.querySelectorAll("[data-wall]")).toHaveLength(1);
    expect(
      container.querySelector("[data-game-result-overlay]"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 / 3 步")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到开局" }));
    expect(screen.getByTitle("红方（先手）棋子：(4, 0)")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-wall]")).toHaveLength(0);
  });

  it("labels move_limit as a user loss", () => {
    const { container } = renderWithProviders(
      <QuoridorReplayBoard
        replay={quoridorReplayFixture({
          moves: [],
          result: { type: "move_limit" },
        })}
      />,
    );
    expect(screen.getByText("步数上限，你的程序判负")).toBeInTheDocument();
    expect(
      container.querySelector("[data-game-result-overlay]"),
    ).not.toBeInTheDocument();
  });
});
