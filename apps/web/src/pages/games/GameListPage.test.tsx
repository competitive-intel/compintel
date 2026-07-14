import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getGames } from "../../lib/api";
import { gameSummaryFixture } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { GameListPage } from "./GameListPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getGames: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("GameListPage", () => {
  it("renders loading and empty states", async () => {
    vi.mocked(getGames).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const first = renderWithProviders(<GameListPage />);
    expect(screen.getByText("正在加载游戏目录…")).toBeInTheDocument();
    first.unmount();

    vi.mocked(getGames).mockResolvedValueOnce([]);
    renderWithProviders(<GameListPage />);
    expect(
      await screen.findByText("当前还没有已发布的游戏"),
    ).toBeInTheDocument();
    expect(screen.queryByText("0 个游戏")).not.toBeInTheDocument();
  });

  it("renders API and unexpected errors", async () => {
    vi.mocked(getGames).mockRejectedValueOnce(
      new ApiError("目录暂不可用", 503, null),
    );
    const first = renderWithProviders(<GameListPage />);
    expect(await screen.findByText("目录暂不可用")).toBeInTheDocument();
    first.unmount();

    vi.mocked(getGames).mockRejectedValueOnce(new Error("offline"));
    renderWithProviders(<GameListPage />);
    expect(await screen.findByText("游戏目录加载失败")).toBeInTheDocument();
  });

  it("renders every game without badges", async () => {
    vi.mocked(getGames).mockResolvedValue([
      gameSummaryFixture(),
      gameSummaryFixture({ id: "game-2", slug: "hex", name: "六角棋" }),
    ]);
    renderWithProviders(<GameListPage />);

    expect(await screen.findByText("五子棋")).toBeInTheDocument();
    expect(screen.getByText("六角棋")).toBeInTheDocument();
    expect(screen.getByText("五子棋").closest("a")).toHaveAttribute(
      "href",
      "/games/gomoku",
    );
    expect(
      screen.getAllByText("在棋盘上率先连成五子。")[0]?.closest("a"),
    ).toHaveAttribute("href", "/games/gomoku");
    expect(
      screen.getByRole("list", { name: "游戏列表" }).children,
    ).toHaveLength(2);
    expect(
      screen.getByRole("list", { name: "游戏列表" }).firstElementChild,
    ).toHaveClass("first:pt-0");
    expect(document.title).toBe("游戏目录 | CompIntel");
    expect(screen.queryByText("2 个游戏")).not.toBeInTheDocument();
    expect(screen.queryByText("开放提交")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("评测资源限制")).not.toBeInTheDocument();
  });
});
