import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCurrentUser } from "../lib/auth";
import { adminUserFixture } from "../test/fixtures";
import { renderWithProviders } from "../test/render";
import { AppShell } from "./AppShell";

vi.mock("../lib/auth", () => ({
  currentUserQueryKey: ["auth", "me"],
  useCurrentUser: vi.fn(),
}));
vi.mock("./EvaluationWorkerStatusAlert", () => ({
  EvaluationWorkerStatusAlert: () => <div>worker-status-alert</div>,
}));
vi.mock("./ThemeToggle", () => ({ ThemeToggle: () => null }));

afterEach(() => vi.clearAllMocks());

describe("AppShell", () => {
  it("renders the worker status below navigation only for administrators", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      data: adminUserFixture({ role: "ADMIN" }),
    } as unknown as ReturnType<typeof useCurrentUser>);
    const adminView = renderWithProviders(<AppShell />);

    const navigation = screen.getByRole("banner");
    const warning = screen.getByText("worker-status-alert");
    expect(
      navigation.compareDocumentPosition(warning) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    adminView.unmount();

    vi.mocked(useCurrentUser).mockReturnValue({
      data: adminUserFixture({ role: "USER" }),
    } as unknown as ReturnType<typeof useCurrentUser>);
    renderWithProviders(<AppShell />);

    expect(screen.queryByText("worker-status-alert")).not.toBeInTheDocument();
  });
});
