import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, login } from "../../lib/api";
import { renderWithProviders } from "../../test/render";
import { LoginPage } from "./LoginPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  login: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("LoginPage", () => {
  it.each([
    ["ACCOUNT_PENDING", "账号正在等待管理员审核"],
    ["ACCOUNT_REJECTED", "账号申请未通过审核"],
  ])("renders the %s account state", async (code, message) => {
    vi.mocked(login).mockRejectedValue(new ApiError("登录失败", 403, code));
    renderWithProviders(<LoginPage />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("renders API and unexpected failures", async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new ApiError("用户名或密码错误", 401, null))
      .mockRejectedValueOnce(new Error("offline"));
    renderWithProviders(<LoginPage />);

    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "用户名或密码错误",
    );

    await userEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "登录失败，请稍后重试",
    );
  });

  it("disables the submit button while login is pending", async () => {
    vi.mocked(login).mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(<LoginPage />);

    await fillAndSubmit();

    expect(screen.getByRole("button", { name: "正在登录…" })).toBeDisabled();
  });
});

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("用户名"), "member");
  await userEvent.type(screen.getByLabelText("密码"), "password123");
  await userEvent.click(screen.getByRole("button", { name: "登录" }));
}
