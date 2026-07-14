import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getSubmissionDetail } from "../../lib/api";
import {
  evaluationFixture,
  submissionDetailFixture,
} from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { SubmissionDetailPage } from "./SubmissionDetailPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getSubmissionDetail: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("SubmissionDetailPage", () => {
  it("renders loading and API error states", async () => {
    vi.mocked(getSubmissionDetail).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const loading = renderPage();
    expect(screen.getByText("正在加载评测详情…")).toBeInTheDocument();
    loading.unmount();

    vi.mocked(getSubmissionDetail).mockRejectedValueOnce(
      new ApiError("提交不存在", 404, null),
    );
    renderPage();
    expect(await screen.findByText("提交不存在")).toBeInTheDocument();
  });

  it("renders an empty evaluation state", async () => {
    vi.mocked(getSubmissionDetail).mockResolvedValue(
      submissionDetailFixture({ evaluations: [] }),
    );
    renderPage();

    expect(
      await screen.findByText("这个提交没有关联的评测任务"),
    ).toBeInTheDocument();
  });

  it.each([
    ["QUEUED", "排队中"],
    ["RUNNING", "评测中"],
    ["FINISHED", "评测完成"],
  ] as const)("renders the %s submission state", async (status, label) => {
    vi.mocked(getSubmissionDetail).mockResolvedValue(
      submissionDetailFixture({
        status,
        evaluations: [evaluationFixture()],
      }),
    );
    renderPage();

    expect(await screen.findByText(label)).toBeInTheDocument();
    if (status === "FINISHED") {
      expect(
        screen.queryByText("页面会自动刷新，直到全部评测完成。"),
      ).not.toBeInTheDocument();
    } else {
      expect(
        screen.getByText("页面会自动刷新，直到全部评测完成。"),
      ).toBeInTheDocument();
    }
  });

  it("renders source, summary, and all opponents", async () => {
    vi.mocked(getSubmissionDetail).mockResolvedValue(
      submissionDetailFixture({
        evaluationSummary: { total: 2, finished: 2, won: 1 },
        evaluations: [
          evaluationFixture(),
          evaluationFixture({
            id: "evaluation-2",
            opponentName: "防守程序",
            verdict: "INVALID_MOVE",
          }),
        ],
      }),
    );
    renderPage();

    expect(await screen.findByLabelText("提交源码")).toHaveTextContent(
      "int main() {}",
    );
    expect(screen.getByText("击败对手")).toBeInTheDocument();
    expect(screen.queryByText("提交源码")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "评测结果" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("平台程序对战结果")).not.toBeInTheDocument();
    expect(document.title).toBe("edge-player | CompIntel");
    expect(
      screen.getByRole("navigation", { name: "breadcrumb" }),
    ).toHaveTextContent("游戏目录五子棋评测记录edge-player");
    expect(screen.queryByText(/返回.*评测记录/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "基准程序" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "防守程序" }),
    ).toBeInTheDocument();
    expect(screen.getByText("非法操作")).toBeInTheDocument();
  });
});

function renderPage() {
  return renderWithProviders(<SubmissionDetailPage />, {
    route: "/submissions/version-1",
    routePath: "/submissions/:submissionId",
  });
}
