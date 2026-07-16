import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  getCaptchaConfig,
  resendVerification,
  verifyEmail,
} from "../../lib/api";
import { renderWithProviders } from "../../test/render";
import { userFixture } from "../../test/fixtures";
import { VerifyEmailPage } from "./VerifyEmailPage";

const navigate = vi.fn();

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
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
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

afterEach(() => vi.clearAllMocks());

describe("VerifyEmailPage", () => {
  it("submits the verification code", async () => {
    vi.mocked(verifyEmail).mockResolvedValue({
      user: userFixture({ emailVerified: true }),
    });
    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: [
        { pathname: "/verify-email", state: { username: "member" } },
      ],
    });

    expect(screen.getByLabelText("用户名")).toHaveValue("member");
    await userEvent.type(screen.getByLabelText("验证码"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "验证邮箱" }));

    expect(verifyEmail).toHaveBeenCalledWith({
      username: "member",
      code: "123456",
    });
    expect(navigate).toHaveBeenCalledWith("/login", {
      state: { username: "member" },
    });
  });

  it("shows API errors when verification fails", async () => {
    vi.mocked(verifyEmail).mockRejectedValue(
      new ApiError("验证码不正确", 400, "VERIFICATION_INVALID"),
    );
    renderWithProviders(<VerifyEmailPage />);

    await userEvent.type(screen.getByLabelText("用户名"), "member");
    await userEvent.type(screen.getByLabelText("验证码"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "验证邮箱" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("验证码不正确");
  });

  it("can resend a verification code", async () => {
    vi.mocked(resendVerification).mockResolvedValue(undefined);
    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: [
        { pathname: "/verify-email", state: { username: "member" } },
      ],
    });

    await userEvent.click(
      screen.getByRole("button", { name: "重新发送验证码" }),
    );
    expect(resendVerification).toHaveBeenCalledWith({ username: "member" });
    expect(
      await screen.findByText("验证码已重新发送，请查收邮箱。"),
    ).toBeInTheDocument();
  });

  it("shows API errors when resend fails", async () => {
    vi.mocked(resendVerification).mockRejectedValue(
      new ApiError("发送过于频繁，请稍后再试", 429, "RATE_LIMITED"),
    );
    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: [
        { pathname: "/verify-email", state: { username: "member" } },
      ],
    });

    await userEvent.click(
      screen.getByRole("button", { name: "重新发送验证码" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "发送过于频繁，请稍后再试",
    );
  });

  it("shows captcha and keeps resend disabled until a token is provided when TURNSTILE_REQUIRED", async () => {
    vi.mocked(resendVerification).mockRejectedValue(
      new ApiError("需要人机验证", 429, "TURNSTILE_REQUIRED"),
    );
    vi.mocked(getCaptchaConfig).mockResolvedValue({
      turnstileSiteKey: "test-site-key",
    });
    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: [
        { pathname: "/verify-email", state: { username: "member" } },
      ],
    });

    await userEvent.click(
      screen.getByRole("button", { name: "重新发送验证码" }),
    );

    expect(await screen.findByText("需要人机验证")).toBeInTheDocument();
    expect(getCaptchaConfig).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "mock-turnstile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新发送验证码" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "mock-turnstile" }));

    expect(
      screen.getByRole("button", { name: "重新发送验证码" }),
    ).toBeEnabled();
  });

  it("resets Turnstile after a failed resend so a fresh token is required", async () => {
    vi.mocked(getCaptchaConfig).mockResolvedValue({
      turnstileSiteKey: "test-site-key",
    });
    vi.mocked(resendVerification)
      .mockRejectedValueOnce(
        new ApiError("需要人机验证", 429, "TURNSTILE_REQUIRED"),
      )
      .mockRejectedValueOnce(
        new ApiError("用户不存在", 404, "USER_NOT_FOUND"),
      );
    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: [
        { pathname: "/verify-email", state: { username: "member" } },
      ],
    });

    await userEvent.click(
      screen.getByRole("button", { name: "重新发送验证码" }),
    );
    expect(await screen.findByText("需要人机验证")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "mock-turnstile" }));
    await userEvent.click(
      screen.getByRole("button", { name: "重新发送验证码" }),
    );

    expect(await screen.findByText("用户不存在")).toBeInTheDocument();
    expect(resendVerification).toHaveBeenLastCalledWith({
      username: "member",
      turnstileToken: "test-turnstile-token-1",
    });
    expect(
      screen.getByRole("button", { name: "重新发送验证码" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "mock-turnstile" }));
    expect(
      screen.getByRole("button", { name: "重新发送验证码" }),
    ).toBeEnabled();
  });

  it("disables the verify button while verification is pending", async () => {
    vi.mocked(verifyEmail).mockImplementation(
      () => new Promise(() => undefined),
    );
    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: [
        { pathname: "/verify-email", state: { username: "member" } },
      ],
    });

    await userEvent.type(screen.getByLabelText("验证码"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "验证邮箱" }));

    expect(screen.getByRole("button", { name: "正在验证…" })).toBeDisabled();
  });

  it("disables the resend button while resend is pending", async () => {
    vi.mocked(resendVerification).mockImplementation(
      () => new Promise(() => undefined),
    );
    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: [
        { pathname: "/verify-email", state: { username: "member" } },
      ],
    });

    await userEvent.click(
      screen.getByRole("button", { name: "重新发送验证码" }),
    );

    expect(screen.getByRole("button", { name: "正在发送…" })).toBeDisabled();
  });
});
