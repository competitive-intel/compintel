import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, resendVerification, verifyEmail } from "../../lib/api";
import { renderWithProviders } from "../../test/render";
import { userFixture } from "../../test/fixtures";
import { VerifyEmailPage } from "./VerifyEmailPage";

const navigate = vi.fn();

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

afterEach(() => vi.clearAllMocks());

describe("VerifyEmailPage", () => {
  it("submits the verification code", async () => {
    vi.mocked(verifyEmail).mockResolvedValue({
      user: userFixture({ emailVerified: true, approvalStatus: "PENDING" }),
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
    expect(navigate).toHaveBeenCalledWith("/pending", {
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
