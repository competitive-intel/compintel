import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getSubmissionRecords } from "../../lib/api";
import { submissionRecordFixture } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { SubmissionListPage } from "./SubmissionListPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getSubmissionRecords: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("SubmissionListPage", () => {
  it("renders loading, empty, and error states", async () => {
    vi.mocked(getSubmissionRecords).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const loading = renderPage();
    expect(screen.getByText("正在加载评测记录…")).toBeInTheDocument();
    loading.unmount();

    vi.mocked(getSubmissionRecords).mockResolvedValueOnce({
      submissions: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    const empty = renderPage();
    expect(
      await screen.findByText("这个游戏还没有用户提交"),
    ).toBeInTheDocument();
    empty.unmount();

    vi.mocked(getSubmissionRecords).mockRejectedValueOnce(
      new ApiError("记录不可用", 503, null),
    );
    renderPage();
    expect(await screen.findByText("记录不可用")).toBeInTheDocument();
  });

  it("renders queued, running, and finished submissions", async () => {
    vi.mocked(getSubmissionRecords).mockResolvedValue({
      submissions: [
        submissionRecordFixture({ id: "queued", status: "QUEUED" }),
        submissionRecordFixture({ id: "running", status: "RUNNING" }),
        submissionRecordFixture({
          id: "finished",
          status: "FINISHED",
          evaluationSummary: { total: 2, finished: 2, won: 1 },
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 3,
    });
    renderPage();

    expect(await screen.findByText("排队中")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "breadcrumb" }),
    ).toHaveTextContent("游戏目录游戏详情评测记录");
    expect(screen.queryByText("返回游戏详情")).not.toBeInTheDocument();
    expect(screen.getByText("评测中")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("击败 1/2 个对手")).toBeInTheDocument();
    expect(screen.queryByText(/通过/u)).not.toBeInTheDocument();
    expect(screen.getByText("共 3 条记录")).toBeInTheDocument();
  });

  it("updates page content and button boundaries", async () => {
    vi.mocked(getSubmissionRecords)
      .mockResolvedValueOnce({
        submissions: [submissionRecordFixture({ playerName: "第一页程序" })],
        page: 1,
        pageSize: 20,
        total: 21,
      })
      .mockResolvedValueOnce({
        submissions: [submissionRecordFixture({ playerName: "第二页程序" })],
        page: 2,
        pageSize: 20,
        total: 21,
      });
    renderPage();

    expect(await screen.findByText("第一页程序")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(await screen.findByText("第二页程序")).toBeInTheDocument();
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });
});

function renderPage() {
  return renderWithProviders(<SubmissionListPage />, {
    route: "/games/gomoku/submissions",
    routePath: "/games/:gameSlug/submissions",
  });
}
