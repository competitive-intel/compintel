import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, banUser, getAdminUsers, unbanUser } from "../../lib/api";
import { adminUserFixture } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { AdminUsersPage } from "./AdminUsersPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getAdminUsers: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("AdminUsersPage", () => {
  it("renders loading, empty, and API error states", async () => {
    vi.mocked(getAdminUsers).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const loading = renderPage();
    expect(screen.getByText("正在加载用户…")).toBeInTheDocument();
    loading.unmount();

    vi.mocked(getAdminUsers).mockResolvedValueOnce([]);
    const empty = renderPage();
    expect(await screen.findByText("暂无注册用户")).toBeInTheDocument();
    empty.unmount();

    vi.mocked(getAdminUsers).mockRejectedValueOnce(
      new ApiError("用户列表不可用", 503, null),
    );
    renderPage();
    expect(await screen.findByText("用户列表不可用")).toBeInTheDocument();
  });

  it("renders roles, submission counts, and banned count", async () => {
    vi.mocked(getAdminUsers).mockResolvedValue([
      adminUserFixture({
        id: "admin",
        role: "ADMIN",
        displayName: "管理员",
        submissionCount: 0,
      }),
      adminUserFixture({
        id: "member",
        displayName: "普通用户",
        submissionCount: 12,
      }),
      adminUserFixture({
        id: "banned",
        role: "BANNED",
        displayName: "封禁用户",
        submissionCount: 3,
      }),
    ]);
    renderPage();

    expect(await screen.findByText("1 个已封禁")).toBeInTheDocument();
    expect(screen.getAllByText("管理员")).toHaveLength(2);
    expect(screen.getByText("已封禁")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("bans a user", async () => {
    const member = adminUserFixture({
      id: "candidate",
      displayName: "普通用户",
      submissionCount: 1,
    });
    vi.mocked(getAdminUsers).mockResolvedValue([member]);
    vi.mocked(banUser).mockResolvedValue({
      ...member,
      role: "BANNED",
    });
    renderPage();

    const row = (await screen.findByText("普通用户")).closest("article");
    expect(row).not.toBeNull();
    await userEvent.click(within(row!).getByRole("button", { name: "封禁" }));

    expect(banUser).toHaveBeenCalledWith("candidate");
    expect(await within(row!).findByText("已封禁")).toBeInTheDocument();
  });

  it("unbans a user", async () => {
    const banned = adminUserFixture({
      id: "candidate",
      role: "BANNED",
      displayName: "封禁用户",
      submissionCount: 1,
    });
    vi.mocked(getAdminUsers).mockResolvedValue([banned]);
    vi.mocked(unbanUser).mockResolvedValue({
      ...banned,
      role: "USER",
    });
    renderPage();

    const row = (await screen.findByText("封禁用户")).closest("article");
    expect(row).not.toBeNull();
    await userEvent.click(within(row!).getByRole("button", { name: "解封" }));

    expect(unbanUser).toHaveBeenCalledWith("candidate");
    expect(await within(row!).findByText("用户")).toBeInTheDocument();
  });

  it("renders ban failures", async () => {
    vi.mocked(getAdminUsers).mockResolvedValue([
      adminUserFixture({ id: "candidate", displayName: "普通用户" }),
    ]);
    vi.mocked(banUser).mockRejectedValue(
      new ApiError("不能封禁管理员账号", 400, "CANNOT_BAN_ADMIN"),
    );
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "封禁" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "不能封禁管理员账号",
    );
  });
});

function renderPage() {
  return renderWithProviders(<AdminUsersPage />);
}
