import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageTitle } from "./PageTitle";

describe("PageTitle", () => {
  it("renders the shared responsive page heading size", () => {
    render(<PageTitle>页面标题</PageTitle>);

    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      "text-2xl",
      "font-semibold",
      "sm:text-3xl",
    );
  });
});
