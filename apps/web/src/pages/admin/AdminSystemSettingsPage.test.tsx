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
      tencentSesCredentialsConfigured: true,
      tencentSesFromAddress: "noreply@mail.example.com",
      tencentSesTemplateId: 121332,
      allowedEmailProviders: ["gmail.com", "qq.com"],
      turnstileSiteKey: "",
      turnstileSecretKeyConfigured: false,
      updatedAt: "2026-07-15T08:00:00.000Z",
    });
    vi.mocked(updateSystemSettings).mockResolvedValue({
      tencentSesCredentialsConfigured: true,
      tencentSesFromAddress: "noreply@mail.example.com",
      tencentSesTemplateId: 121332,
      allowedEmailProviders: ["gmail.com", "163.com"],
      turnstileSiteKey: "1x00000000000000000000AA",
      turnstileSecretKeyConfigured: true,
      updatedAt: "2026-07-15T09:00:00.000Z",
    });

    renderWithProviders(<AdminSystemSettingsPage />);

    expect(
      await screen.findByDisplayValue("noreply@mail.example.com"),
    ).toBeInTheDocument();
    expect(screen.queryByText("SES 凭证未配置")).not.toBeInTheDocument();
    expect(screen.queryByText(/TENCENT_SES_SECRET_/)).not.toBeInTheDocument();
    expect(screen.getByText("腾讯云邮件推送")).toBeInTheDocument();
    expect(screen.getByText("Cloudflare Turnstile")).toBeInTheDocument();
    expect(screen.getByText("gmail.com")).toBeInTheDocument();
    expect(screen.getByText("qq.com")).toBeInTheDocument();

    const siteKey = screen.getByLabelText("Turnstile Site Key");
    await userEvent.type(siteKey, "1x00000000000000000000AA");
    const turnstileSecret = screen.getByLabelText("Turnstile Secret Key");
    await userEvent.type(turnstileSecret, "1x0000000000000000000000000000000AA");

    const qqChip = screen
      .getByText("qq.com")
      .closest('[data-slot="combobox-chip"]') as HTMLElement | null;
    expect(qqChip).not.toBeNull();
    await userEvent.click(within(qqChip!).getByRole("button"));
    await userEvent.click(screen.getByPlaceholderText("选择邮箱域名…"));
    await userEvent.click(
      await screen.findByRole("option", { name: "163.com" }),
    );
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() =>
      expect(updateSystemSettings).toHaveBeenCalledWith({
        tencentSesFromAddress: "noreply@mail.example.com",
        tencentSesTemplateId: 121332,
        allowedEmailProviders: ["gmail.com", "163.com"],
        turnstileSiteKey: "1x00000000000000000000AA",
        turnstileSecretKey: "1x0000000000000000000000000000000AA",
      }),
    );
    expect(await screen.findByText("系统设置已保存。")).toBeInTheDocument();
  });

  it("shows a destructive warning when SES credentials are missing", async () => {
    vi.mocked(getSystemSettings).mockResolvedValue({
      tencentSesCredentialsConfigured: false,
      tencentSesFromAddress: "noreply@mail.example.com",
      tencentSesTemplateId: 121332,
      allowedEmailProviders: ["gmail.com"],
      turnstileSiteKey: "",
      turnstileSecretKeyConfigured: false,
      updatedAt: "2026-07-15T08:00:00.000Z",
    });

    renderWithProviders(<AdminSystemSettingsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("SES 凭证未配置");
    expect(alert).toHaveTextContent("当前无法发送验证邮件");
    expect(screen.queryByText(/TENCENT_SES_SECRET_/)).not.toBeInTheDocument();
  });

  it("rejects malformed SES template IDs", async () => {
    vi.mocked(getSystemSettings).mockResolvedValue({
      tencentSesCredentialsConfigured: true,
      tencentSesFromAddress: "noreply@mail.example.com",
      tencentSesTemplateId: 121332,
      allowedEmailProviders: ["gmail.com"],
      turnstileSiteKey: "",
      turnstileSecretKeyConfigured: false,
      updatedAt: "2026-07-15T08:00:00.000Z",
    });

    renderWithProviders(<AdminSystemSettingsPage />);

    const templateId = await screen.findByLabelText("腾讯云 SES 模板 ID");
    for (const value of ["123abc", "12.5", "0", "-1", "  "]) {
      await userEvent.clear(templateId);
      if (value.trim().length > 0) {
        await userEvent.type(templateId, value);
      }
      await userEvent.click(screen.getByRole("button", { name: "保存设置" }));
      expect(
        await screen.findByText("请输入有效的 SES 模板 ID"),
      ).toBeInTheDocument();
      expect(updateSystemSettings).not.toHaveBeenCalled();
    }
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
