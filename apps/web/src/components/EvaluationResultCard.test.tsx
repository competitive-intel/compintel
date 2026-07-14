import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { evaluationFixture, replayFixture } from "../test/fixtures";
import { renderWithProviders } from "../test/render";
import { EvaluationResultCard } from "./EvaluationResultCard";

describe("EvaluationResultCard", () => {
  it.each([
    ["QUEUED", "排队中"],
    ["COMPILING", "评测中"],
    ["RUNNING", "评测中"],
  ] as const)("renders the %s progress state", (status, label) => {
    renderCard({ status, verdict: null });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    ["ACCEPTED", "评测通过"],
    ["COMPILE_ERROR", "编译错误"],
    ["RUNTIME_ERROR", "运行错误"],
    ["TIME_LIMIT_EXCEEDED", "时间超限"],
    ["MEMORY_LIMIT_EXCEEDED", "内存超限"],
    ["OUTPUT_LIMIT_EXCEEDED", "输出超限"],
    ["DANGEROUS_SYSCALL", "危险系统调用"],
    ["INVALID_MOVE", "非法操作"],
    ["INTERNAL_ERROR", "平台内部错误"],
  ] as const)("renders the %s verdict", (verdict, label) => {
    renderCard({ verdict });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders unknown verdict and null resource values", () => {
    renderCard({
      verdict: null,
      cpuTimeNs: null,
      wallTimeNs: null,
      memoryBytes: null,
    });
    expect(screen.getByText("结果未知")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it.each([
    ["500000", "0.500 ms"],
    ["1000000", "1.00 ms"],
  ])("formats %s nanoseconds", (value, expected) => {
    renderCard({ cpuTimeNs: value });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it.each([
    ["1023", "1023 B"],
    ["1024", "1.0 KiB"],
    ["1048576", "1.0 MiB"],
  ])("formats %s bytes", (value, expected) => {
    renderCard({ memoryBytes: value });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("conditionally renders errors, logs, and replay", () => {
    renderCard({
      errorMessage: "程序异常退出",
      compileLog: "compiler output",
      stderr: "standard error",
      stdout: "standard output",
      replay: replayFixture(),
    });

    expect(screen.getByText("程序异常退出")).toBeInTheDocument();
    expect(screen.getByText("编译日志")).toBeInTheDocument();
    expect(screen.getByText("标准错误")).toBeInTheDocument();
    expect(screen.getByText("标准输出")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "对局终局棋盘" }),
    ).toBeInTheDocument();
  });

  it("collapses and expands an opponent result", () => {
    renderCard({ replay: replayFixture() });

    const trigger = screen.getByRole("button", {
      name: "展开或收起 基准程序 的评测结果",
    });
    expect(trigger).toHaveClass("size-7");
    expect(trigger.parentElement?.parentElement).toHaveClass("items-center");
    expect(
      screen.getByRole("heading", { name: "基准程序" }).parentElement
        ?.parentElement?.parentElement,
    ).toHaveClass("group-data-[state=closed]/evaluation:py-4");
    expect(screen.getByText("CPU 时间")).toBeVisible();
    expect(screen.queryByText("平台对手 · 版本 1")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByText("CPU 时间")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText("CPU 时间")).toBeVisible();
  });
});

function renderCard(overrides = {}) {
  return renderWithProviders(
    <EvaluationResultCard evaluation={evaluationFixture(overrides)} />,
  );
}
