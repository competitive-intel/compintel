import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getPlayerNames, submitPlayer } from "../lib/api";
import { renderWithProviders } from "../test/render";
import { GameSubmissionPanel } from "./GameSubmissionPanel";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  submitPlayer: vi.fn(),
  getPlayerNames: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPlayerNames).mockResolvedValue([]);
});

describe("GameSubmissionPanel", () => {
  it("offers the current user's used player names", async () => {
    vi.mocked(getPlayerNames).mockResolvedValue(["alpha", "edge-player"]);
    renderPanel();

    expect(
      await screen.findByText(
        "选择已用名称会自动创建下一版本；新名称会创建版本 1。",
      ),
    ).toBeInTheDocument();
    expect(getPlayerNames).toHaveBeenCalledWith(
      "gomoku",
      expect.any(AbortSignal),
    );
    const combobox = screen.getByLabelText("AI 名称");
    expect(combobox).toHaveAttribute("role", "combobox");

    await userEvent.click(combobox);
    await userEvent.type(
      screen.getByPlaceholderText("输入或搜索 Player 名称…"),
      "alp",
    );
    await userEvent.click(screen.getByText("alpha"));

    expect(combobox).toHaveTextContent("alpha");
  });

  it("submits source and renders the accepted summary", async () => {
    vi.mocked(submitPlayer).mockResolvedValue({
      playerId: "player-1",
      playerVersionId: "version-2",
      version: 2,
      evaluationIds: ["evaluation-1", "evaluation-2"],
      evaluationStatus: "QUEUED",
    });
    renderPanel();

    await fillAndSubmit();

    expect(submitPlayer).toHaveBeenCalledWith("gomoku", {
      name: "edge-player",
      sourceCode: "int main() {}",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "提交已受理，可查看评测详情。",
    );
  });

  it("disables submission while pending", async () => {
    vi.mocked(submitPlayer).mockImplementation(
      () => new Promise(() => undefined),
    );
    renderPanel();
    await fillAndSubmit();

    expect(screen.getByRole("button", { name: "正在提交…" })).toBeDisabled();
  });

  it("renders API and unexpected failures", async () => {
    vi.mocked(submitPlayer)
      .mockRejectedValueOnce(new ApiError("源码过大", 400, null))
      .mockRejectedValueOnce(new Error("offline"));
    renderPanel();

    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("源码过大");

    await userEvent.click(screen.getByRole("button", { name: "提交程序" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "提交失败，请稍后重试",
    );
  });
});

function renderPanel() {
  return renderWithProviders(<GameSubmissionPanel gameSlug="gomoku" />);
}

async function fillAndSubmit() {
  await userEvent.click(screen.getByLabelText("AI 名称"));
  await userEvent.type(
    screen.getByPlaceholderText("输入或搜索 Player 名称…"),
    "edge-player",
  );
  fireEvent.change(screen.getByLabelText("程序代码"), {
    target: { value: "int main() {}" },
  });
  await userEvent.click(screen.getByRole("button", { name: "提交程序" }));
}
