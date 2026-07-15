import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, resendVerification, verifyEmail } from "../../lib/api";
import { renderWithProviders } from "../../test/render";
import { userFixture } from "../../test/fixtures";
import { VerifyEmailPage } from "./VerifyEmailPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("VerifyEmailPage", () => {
  it("submits the verification code", async () => {
    vi.mocked(verifyEmail).mockResolvedValue(
      userFixture({ emailVerified: true, approvalStatus: "PENDING" }),
    );
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
});
