import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  getAdminBuiltinPlayers,
  getAdminGames,
  updateGame,
} from "../../lib/api";
import { adminGameFixture } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { AdminGamesPage } from "./AdminGamesPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getAdminBuiltinPlayers: vi.fn(),
  getAdminGames: vi.fn(),
  updateGame: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("AdminGamesPage", () => {
  it("renders loading, empty, and API error states", async () => {
    vi.mocked(getAdminGames).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const loading = renderPage();
    expect(screen.getByText("正在加载游戏…")).toBeInTheDocument();
    loading.unmount();

    vi.mocked(getAdminGames).mockResolvedValueOnce([]);
    const empty = renderPage();
    expect(await screen.findByText("暂无游戏")).toBeInTheDocument();
    expect(
      screen.getByText("暂无可管理的游戏，请先通过源代码配置游戏"),
    ).toBeInTheDocument();
    empty.unmount();

    vi.mocked(getAdminGames).mockRejectedValueOnce(
      new ApiError("管理列表不可用", 503, null),
    );
    renderPage();
    expect(await screen.findByText("管理列表不可用")).toBeInTheDocument();
  });

  it("selects the first game and updates editable fields without slug", async () => {
    const game = adminGameFixture();
    vi.mocked(getAdminGames).mockResolvedValue([game]);
    vi.mocked(getAdminBuiltinPlayers).mockResolvedValue([]);
    vi.mocked(updateGame).mockResolvedValue({
      ...game,
      summary: "更新后的摘要",
    });
    renderPage();

    const slug = await screen.findByLabelText("游戏标识");
    expect(slug).toBeDisabled();
    const summary = screen.getByLabelText("列表摘要");
    await userEvent.clear(summary);
    await userEvent.type(summary, "更新后的摘要");
    const moveCpuLimit = screen.getByLabelText("每步 CPU 时间");
    await userEvent.clear(moveCpuLimit);
    await userEvent.type(moveCpuLimit, "250");
    await userEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(updateGame).toHaveBeenCalledWith(
      "game-1",
      expect.not.objectContaining({ slug: expect.anything() }),
    );
    expect(updateGame).toHaveBeenCalledWith(
      "game-1",
      expect.objectContaining({ summary: "更新后的摘要" }),
    );
    expect(updateGame).toHaveBeenCalledWith(
      "game-1",
      expect.objectContaining({
        resourceLimits: {
          moveCpuLimitMs: 250,
          totalCpuLimitMs: 5_000,
          memoryLimitMiB: 256,
        },
      }),
    );
  });

  it("does not offer database-backed game creation", async () => {
    vi.mocked(getAdminGames).mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByText("暂无可管理的游戏，请先通过源代码配置游戏"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "新增游戏" }),
    ).not.toBeInTheDocument();
  });

  it("renders save failures", async () => {
    vi.mocked(getAdminGames).mockResolvedValue([adminGameFixture()]);
    vi.mocked(getAdminBuiltinPlayers).mockResolvedValue([]);
    vi.mocked(updateGame).mockRejectedValue(
      new ApiError("保存冲突", 409, null),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "保存修改" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("保存冲突");
  });
});

function renderPage() {
  return renderWithProviders(<AdminGamesPage />);
}
