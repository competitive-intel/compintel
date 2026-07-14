import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getAdminUsers, reviewUser } from "../../lib/api";
import { adminUserFixture } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { AdminUsersPage } from "./AdminUsersPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getAdminUsers: vi.fn(),
  reviewUser: vi.fn(),
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

  it("renders roles, approval states, and pending count", async () => {
    vi.mocked(getAdminUsers).mockResolvedValue([
      adminUserFixture({ id: "admin", role: "ADMIN", displayName: "管理员" }),
      adminUserFixture({ id: "pending", approvalStatus: "PENDING" }),
      adminUserFixture({ id: "approved", approvalStatus: "APPROVED" }),
      adminUserFixture({ id: "rejected", approvalStatus: "REJECTED" }),
    ]);
    renderPage();

    expect(await screen.findByText("1 个待审核")).toBeInTheDocument();
    expect(screen.getAllByText("管理员")).toHaveLength(2);
    expect(screen.getByText("待审核")).toBeInTheDocument();
    expect(screen.getAllByText("已通过")).toHaveLength(2);
    expect(screen.getByText("已拒绝")).toBeInTheDocument();
  });

  it.each([
    ["通过", "APPROVE", "APPROVED", "已通过"],
    ["拒绝", "REJECT", "REJECTED", "已拒绝"],
  ] as const)(
    "handles the %s action",
    async (button, decision, status, label) => {
      const pending = adminUserFixture({
        id: "candidate",
        displayName: "待审核用户",
        approvalStatus: "PENDING",
      });
      vi.mocked(getAdminUsers).mockResolvedValue([pending]);
      vi.mocked(reviewUser).mockResolvedValue({
        ...pending,
        approvalStatus: status,
      });
      renderPage();

      const row = (await screen.findByText("待审核用户")).closest("article");
      expect(row).not.toBeNull();
      await userEvent.click(within(row!).getByRole("button", { name: button }));

      expect(reviewUser).toHaveBeenCalledWith("candidate", { decision });
      expect(await within(row!).findByText(label)).toBeInTheDocument();
    },
  );

  it("renders review failures", async () => {
    vi.mocked(getAdminUsers).mockResolvedValue([
      adminUserFixture({ id: "candidate", approvalStatus: "PENDING" }),
    ]);
    vi.mocked(reviewUser).mockRejectedValue(
      new ApiError("审核状态已变化", 409, null),
    );
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "通过" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "审核状态已变化",
    );
  });
});

function renderPage() {
  return renderWithProviders(<AdminUsersPage />);
}
