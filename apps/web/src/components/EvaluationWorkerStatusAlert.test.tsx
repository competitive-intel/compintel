import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getEvaluationWorkerStatus } from "../lib/api";
import { renderWithProviders } from "../test/render";
import { EvaluationWorkerStatusAlert } from "./EvaluationWorkerStatusAlert";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  getEvaluationWorkerStatus: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("EvaluationWorkerStatusAlert", () => {
  it("warns when no evaluation worker is connected", async () => {
    vi.mocked(getEvaluationWorkerStatus).mockResolvedValue({
      online: false,
      workerCount: 0,
    });

    renderWithProviders(<EvaluationWorkerStatusAlert />);

    expect(await screen.findByText("评测 Worker 未运行")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "新提交将停留在“排队中”",
    );
  });

  it("stays hidden while workers are available", async () => {
    vi.mocked(getEvaluationWorkerStatus).mockResolvedValue({
      online: true,
      workerCount: 2,
    });

    renderWithProviders(<EvaluationWorkerStatusAlert />);

    await waitFor(() => expect(getEvaluationWorkerStatus).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns when worker availability cannot be checked", async () => {
    vi.mocked(getEvaluationWorkerStatus).mockRejectedValue(
      new Error("redis unavailable"),
    );

    renderWithProviders(<EvaluationWorkerStatusAlert />);

    expect(
      await screen.findByText("无法确认评测 Worker 状态"),
    ).toBeInTheDocument();
  });
});
