import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getGame } from "../../lib/api";
import { gameDetailFixture } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { GameDetailPage } from "./GameDetailPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getGame: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("GameDetailPage", () => {
  it("renders loading and error states", async () => {
    vi.mocked(getGame).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const first = renderPage();
    expect(screen.getByText("正在加载游戏详情…")).toBeInTheDocument();
    first.unmount();

    vi.mocked(getGame).mockRejectedValueOnce(
      new ApiError("游戏不存在", 404, null),
    );
    renderPage();
    expect(await screen.findByText("游戏不存在")).toBeInTheDocument();
  });

  it("renders game information without implementation details", async () => {
    vi.mocked(getGame).mockResolvedValue(gameDetailFixture());
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "五子棋", level: 1 }),
    ).toBeInTheDocument();
    expect(document.title).toBe("五子棋 | CompIntel");
    expect(
      screen.getByText("双方轮流落子，率先连成五子者获胜。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "游戏介绍" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("从标准输入读取局面，向标准输出写入行动。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "通信协议" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("游戏")).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "breadcrumb" }),
    ).toHaveTextContent("游戏目录五子棋");
    const resourceLimits = screen.getByLabelText("评测资源限制");
    expect(resourceLimits).toHaveTextContent(
      "单步 CPU 100 ms总 CPU 5 s内存 256 MiB",
    );
    expect(resourceLimits.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.getByText("开放提交").parentElement).toContainElement(
      resourceLimits,
    );
    expect(screen.getByLabelText("游戏说明")).not.toHaveClass("max-w-4xl");
  });

  it("scrolls the submission panel into view", async () => {
    vi.mocked(getGame).mockResolvedValue(gameDetailFixture());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "提交" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
  });
});

function renderPage() {
  return renderWithProviders(<GameDetailPage />, {
    route: "/games/gomoku",
    routePath: "/games/:gameSlug",
  });
}
