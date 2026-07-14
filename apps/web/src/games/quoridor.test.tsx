import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/render";
import { QuoridorReplayBoard } from "./quoridor";
import { quoridorReplayFixture } from "./quoridor.test-fixtures";

describe("QuoridorReplayBoard", () => {
  it("renders pawns, horizontal and vertical walls", () => {
    const { container } = renderWithProviders(
      <QuoridorReplayBoard replay={quoridorReplayFixture()} />,
    );
    expect(screen.getByText("先手（向下）")).toBeInTheDocument();
    expect(screen.getByText("你的程序获胜")).toBeInTheDocument();
    expect(screen.getByTitle("先手棋子：(4, 1)")).toBeInTheDocument();
    expect(screen.getByTitle("后手棋子：(4, 8)")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-wall]")).toHaveLength(2);
    expect(screen.getByRole("img")).toHaveAccessibleName("路墙棋对局终局棋盘");
  });

  it("steps back through pawn and wall actions", () => {
    const { container } = renderWithProviders(
      <QuoridorReplayBoard replay={quoridorReplayFixture()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(container.querySelectorAll("[data-wall]")).toHaveLength(1);
    expect(screen.getByText("2 / 3 步")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到开局" }));
    expect(screen.getByTitle("先手棋子：(4, 0)")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-wall]")).toHaveLength(0);
  });

  it("labels move_limit as a user loss", () => {
    renderWithProviders(
      <QuoridorReplayBoard
        replay={quoridorReplayFixture({
          moves: [],
          result: { type: "move_limit" },
        })}
      />,
    );
    expect(screen.getByText("步数上限，你的程序判负")).toBeInTheDocument();
  });
});
