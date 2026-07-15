import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  getSystemSettings,
  updateSystemSettings,
} from "../../lib/api";
import { renderWithProviders } from "../../test/render";
import { AdminSystemSettingsPage } from "./AdminSystemSettingsPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getSystemSettings: vi.fn(),
  updateSystemSettings: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("AdminSystemSettingsPage", () => {
  it("loads and saves system settings", async () => {
    vi.mocked(getSystemSettings).mockResolvedValue({
      tencentSesSecretId: "aki",
      tencentSesSecretKeyConfigured: true,
      tencentSesFromAddress: "noreply@mail.example.com",
      tencentSesTemplateId: 121332,
      allowedEmailProviders: ["gmail", "qq"],
      updatedAt: "2026-07-15T08:00:00.000Z",
    });
    vi.mocked(updateSystemSettings).mockResolvedValue({
      tencentSesSecretId: "aki-2",
      tencentSesSecretKeyConfigured: true,
      tencentSesFromAddress: "noreply@mail.example.com",
      tencentSesTemplateId: 121332,
      allowedEmailProviders: ["gmail", "163"],
      updatedAt: "2026-07-15T09:00:00.000Z",
    });

    renderWithProviders(<AdminSystemSettingsPage />);

    expect(
      await screen.findByDisplayValue("noreply@mail.example.com"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("腾讯云 SES SecretKey（SK）")).toHaveAttribute(
      "placeholder",
      "已配置（留空不修改）",
    );
    expect(screen.getByText("腾讯云邮件推送")).toBeInTheDocument();
    expect(screen.getByText("gmail")).toBeInTheDocument();
    expect(screen.getByText("qq")).toBeInTheDocument();

    const secretId = screen.getByLabelText("腾讯云 SES SecretId（AK）");
    await userEvent.clear(secretId);
    await userEvent.type(secretId, "aki-2");

    const qqChip = screen
      .getByText("qq")
      .closest('[data-slot="combobox-chip"]') as HTMLElement | null;
    expect(qqChip).not.toBeNull();
    await userEvent.click(within(qqChip!).getByRole("button"));
    await userEvent.click(screen.getByPlaceholderText("选择邮箱提供商…"));
    await userEvent.click(await screen.findByRole("option", { name: "163" }));
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() =>
      expect(updateSystemSettings).toHaveBeenCalledWith({
        tencentSesSecretId: "aki-2",
        tencentSesFromAddress: "noreply@mail.example.com",
        tencentSesTemplateId: 121332,
        allowedEmailProviders: ["gmail", "163"],
      }),
    );
    expect(await screen.findByText("系统设置已保存。")).toBeInTheDocument();
  });

  it("renders load failures", async () => {
    vi.mocked(getSystemSettings).mockRejectedValue(
      new ApiError("系统设置加载失败", 500, null),
    );
    renderWithProviders(<AdminSystemSettingsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "系统设置加载失败",
    );
  });
});
