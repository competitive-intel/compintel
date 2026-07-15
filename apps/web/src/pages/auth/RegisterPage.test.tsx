import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getCaptchaConfig, register } from "../../lib/api";
import { renderWithProviders } from "../../test/render";
import { RegisterPage } from "./RegisterPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  register: vi.fn(),
  getCaptchaConfig: vi.fn(),
}));
vi.mock("../../components/TurnstileWidget", () => ({
  TurnstileWidget: ({
    onToken,
    resetKey = 0,
  }: {
    siteKey: string;
    onToken: (token: string | null) => void;
    resetKey?: number;
  }) => {
    const skipResetOnMountRef = useRef(true);
    useEffect(() => {
      if (skipResetOnMountRef.current) {
        skipResetOnMountRef.current = false;
        return;
      }
      onToken(null);
    }, [resetKey, onToken]);
    return (
      <button
        type="button"
        onClick={() => onToken(`test-turnstile-token-${resetKey}`)}
      >
        mock-turnstile
      </button>
    );
  },
}));

afterEach(() => vi.clearAllMocks());

describe("RegisterPage", () => {
  it("blocks mismatched passwords before sending a request", async () => {
    renderWithProviders(<RegisterPage />);
    await fillRegistration("password456");

    expect(screen.getByRole("alert")).toHaveTextContent("两次输入的密码不一致");
    expect(register).not.toHaveBeenCalled();
  });

  it("clears the client error and submits after passwords match", async () => {
    vi.mocked(register).mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(<RegisterPage />);
    await fillRegistration("password456");

    const confirmation = screen.getByLabelText("确认密码");
    await userEvent.clear(confirmation);
    await userEvent.type(confirmation, "password123");
    await userEvent.click(screen.getByRole("button", { name: "提交注册申请" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(register).toHaveBeenCalledWith({
      displayName: "新用户",
      username: "New_User",
      email: "new.user@gmail.com",
      password: "password123",
    });
    expect(screen.getByRole("button", { name: "正在提交…" })).toBeDisabled();
  });

  it("renders API and unexpected registration failures", async () => {
    vi.mocked(register)
      .mockRejectedValueOnce(new ApiError("用户名已被使用", 409, null))
      .mockRejectedValueOnce(new Error("offline"));
    renderWithProviders(<RegisterPage />);

    await fillRegistration("password123");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "用户名已被使用",
    );

    await userEvent.click(screen.getByRole("button", { name: "提交注册申请" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "注册失败，请稍后重试",
    );
  });

  it("resets Turnstile after a failed registration so a fresh token is required", async () => {
    vi.mocked(getCaptchaConfig).mockResolvedValue({
      turnstileSiteKey: "test-site-key",
    });
    vi.mocked(register)
      .mockRejectedValueOnce(
        new ApiError("需要人机验证", 429, "TURNSTILE_REQUIRED"),
      )
      .mockRejectedValueOnce(
        new ApiError("邮箱域名不被允许", 400, "EMAIL_PROVIDER_NOT_ALLOWED"),
      );
    renderWithProviders(<RegisterPage />);

    await fillRegistration("password123");
    expect(await screen.findByText("需要人机验证")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "mock-turnstile" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "mock-turnstile" }));
    await userEvent.click(screen.getByRole("button", { name: "提交注册申请" }));

    expect(await screen.findByText("邮箱域名不被允许")).toBeInTheDocument();
    expect(register).toHaveBeenLastCalledWith({
      displayName: "新用户",
      username: "New_User",
      email: "new.user@gmail.com",
      password: "password123",
      turnstileToken: "test-turnstile-token-1",
    });

    await userEvent.click(screen.getByRole("button", { name: "提交注册申请" }));
    expect(screen.getByText("请先完成人机验证")).toBeInTheDocument();
    expect(register).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("button", { name: "mock-turnstile" }));
    await userEvent.click(screen.getByRole("button", { name: "提交注册申请" }));

    expect(register).toHaveBeenLastCalledWith({
      displayName: "新用户",
      username: "New_User",
      email: "new.user@gmail.com",
      password: "password123",
      turnstileToken: "test-turnstile-token-2",
    });
  });
});

async function fillRegistration(confirmation: string) {
  await userEvent.type(screen.getByLabelText("显示名称"), "新用户");
  await userEvent.type(screen.getByLabelText("用户名"), "New_User");
  await userEvent.type(screen.getByLabelText("邮箱"), "new.user@gmail.com");
  await userEvent.type(screen.getByLabelText("密码"), "password123");
  await userEvent.type(screen.getByLabelText("确认密码"), confirmation);
  await userEvent.click(screen.getByRole("button", { name: "提交注册申请" }));
}
