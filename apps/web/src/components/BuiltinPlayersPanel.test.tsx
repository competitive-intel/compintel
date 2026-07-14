import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  createBuiltinPlayer,
  createBuiltinPlayerVersion,
  getAdminBuiltinPlayers,
  updateBuiltinPlayer,
} from "../lib/api";
import { builtinPlayerFixture } from "../test/fixtures";
import { renderWithProviders } from "../test/render";
import { BuiltinPlayersPanel } from "./BuiltinPlayersPanel";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  createBuiltinPlayer: vi.fn(),
  createBuiltinPlayerVersion: vi.fn(),
  getAdminBuiltinPlayers: vi.fn(),
  updateBuiltinPlayer: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("BuiltinPlayersPanel", () => {
  it("creates a new player and adds it to the rendered list", async () => {
    vi.mocked(getAdminBuiltinPlayers).mockResolvedValue([]);
    const created = builtinPlayerFixture({ id: "builtin-2", name: "新程序" });
    vi.mocked(createBuiltinPlayer).mockResolvedValue(created);
    renderPanel();

    await userEvent.type(await screen.findByLabelText("程序名称"), "新程序");
    fireEvent.change(screen.getByLabelText("C++ 源码"), {
      target: { value: "int main() { return 0; }" },
    });
    await userEvent.click(screen.getByRole("button", { name: "创建内置程序" }));

    expect(createBuiltinPlayer).toHaveBeenCalledWith("game-1", {
      name: "新程序",
      sourceCode: "int main() { return 0; }",
      isActive: true,
      weight: 1,
    });
    expect(
      await screen.findByRole("button", { name: /新程序/u }),
    ).toBeInTheDocument();
  });

  it("disables saving an unchanged player", async () => {
    await openExistingPlayer();
    expect(screen.getByRole("button", { name: "保存设置" })).toBeDisabled();
  });

  it("updates metadata without creating a source version", async () => {
    const original = await openExistingPlayer();
    vi.mocked(updateBuiltinPlayer).mockResolvedValue({
      ...original,
      name: "新版基准程序",
    });

    const name = screen.getByLabelText("程序名称");
    await userEvent.clear(name);
    await userEvent.type(name, "新版基准程序");
    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(updateBuiltinPlayer).toHaveBeenCalledWith("builtin-1", {
      name: "新版基准程序",
      isActive: true,
      weight: 1,
    });
    expect(createBuiltinPlayerVersion).not.toHaveBeenCalled();
  });

  it("updates the scoring weight without creating a source version", async () => {
    const original = await openExistingPlayer();
    vi.mocked(updateBuiltinPlayer).mockResolvedValue({
      ...original,
      weight: 5,
    });

    const weight = screen.getByLabelText("评分权重");
    await userEvent.clear(weight);
    await userEvent.type(weight, "5");
    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(updateBuiltinPlayer).toHaveBeenCalledWith("builtin-1", {
      name: "基准程序",
      isActive: true,
      weight: 5,
    });
    expect(createBuiltinPlayerVersion).not.toHaveBeenCalled();
  });

  it("creates an immutable version for source-only edits", async () => {
    const original = await openExistingPlayer();
    vi.mocked(createBuiltinPlayerVersion).mockResolvedValue({
      ...original,
      versionCount: 2,
      latestVersion: {
        ...original.latestVersion,
        id: "builtin-version-2",
        version: 2,
        sourceCode: "int main() { return 0; }",
      },
    });
    fireEvent.change(screen.getByLabelText("C++ 源码"), {
      target: { value: "int main() { return 0; }" },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "保存并创建新版本" }),
    );

    expect(updateBuiltinPlayer).not.toHaveBeenCalled();
    expect(createBuiltinPlayerVersion).toHaveBeenCalledWith("builtin-1", {
      sourceCode: "int main() { return 0; }",
    });
    expect(await screen.findByText("当前 v2")).toBeInTheDocument();
  });

  it("saves metadata before creating a source version", async () => {
    const original = await openExistingPlayer();
    vi.mocked(updateBuiltinPlayer).mockResolvedValue({
      ...original,
      isActive: false,
    });
    vi.mocked(createBuiltinPlayerVersion).mockResolvedValue({
      ...original,
      isActive: false,
      versionCount: 2,
      latestVersion: {
        ...original.latestVersion,
        version: 2,
        sourceCode: "int changed() {}",
      },
    });
    await userEvent.click(screen.getByLabelText("用于新提交评测"));
    fireEvent.change(screen.getByLabelText("C++ 源码"), {
      target: { value: "int changed() {}" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "保存并创建新版本" }),
    );

    expect(updateBuiltinPlayer).toHaveBeenCalledBefore(
      vi.mocked(createBuiltinPlayerVersion),
    );
  });

  it("renders a failure from the second save stage", async () => {
    const original = await openExistingPlayer();
    vi.mocked(updateBuiltinPlayer).mockResolvedValue({
      ...original,
      isActive: false,
    });
    vi.mocked(createBuiltinPlayerVersion).mockRejectedValue(
      new ApiError("版本创建失败", 500, null),
    );
    await userEvent.click(screen.getByLabelText("用于新提交评测"));
    fireEvent.change(screen.getByLabelText("C++ 源码"), {
      target: { value: "int changed() {}" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "保存并创建新版本" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("版本创建失败");
    expect(screen.getByText("当前 v1")).toBeInTheDocument();
  });
});

function renderPanel() {
  return renderWithProviders(
    <BuiltinPlayersPanel gameId="game-1" gameName="五子棋" />,
  );
}

async function openExistingPlayer() {
  const player = builtinPlayerFixture();
  vi.mocked(getAdminBuiltinPlayers).mockResolvedValue([player]);
  renderPanel();
  await userEvent.click(
    await screen.findByRole("button", { name: /基准程序/u }),
  );
  return player;
}
