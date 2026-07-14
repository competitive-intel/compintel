import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/render";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders markdown and KaTeX formulas", () => {
    const { container } = renderWithProviders(
      <MarkdownContent>
        {"## 规则\n\n棋盘为 $15 \\times 15$。"}
      </MarkdownContent>,
    );

    expect(screen.getByRole("heading", { name: "规则" })).toBeInTheDocument();
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("does not render raw HTML from managed content", () => {
    const { container } = renderWithProviders(
      <MarkdownContent>{"<script>bad()</script>"}</MarkdownContent>,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("<script>bad()</script>")).toBeInTheDocument();
  });

  it("statically highlights fenced C++ code with Shiki", async () => {
    const { container } = renderWithProviders(
      <MarkdownContent>
        {"```cpp\nint main() { return 0; }\n```"}
      </MarkdownContent>,
    );

    await waitFor(() =>
      expect(container.querySelector(".shiki")).not.toBeNull(),
    );
    expect(container).toHaveTextContent("int main() { return 0; }");
  });
});
