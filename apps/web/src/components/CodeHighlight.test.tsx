import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/render";
import { CodeHighlight } from "./CodeHighlight";

describe("CodeHighlight", () => {
  it("renders C++ with Shiki's static highlighter", async () => {
    const { container } = renderWithProviders(
      <CodeHighlight code="int main() { return 0; }" label="C++ 源码" />,
    );

    expect(screen.getByLabelText("C++ 源码")).toHaveTextContent("int main()");
    await waitFor(() =>
      expect(container.querySelector(".shiki")).not.toBeNull(),
    );
    expect(container.querySelector(".github-light.github-dark")).not.toBeNull();
  });
});
