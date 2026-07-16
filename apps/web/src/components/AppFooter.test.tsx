import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppFooter } from "./AppFooter";

describe("AppFooter", () => {
  it("shows the project name, linked commit, and open-source repository", () => {
    render(<AppFooter />);

    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      /Competitive Intelligence(?:[0-9a-f]{7}|unknown)开源/,
    );
    const commitLink = screen.queryByRole("link", {
      name: /^[0-9a-f]{7}$/,
    });
    if (commitLink === null) {
      expect(screen.getByText("unknown")).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "unknown" }),
      ).not.toBeInTheDocument();
    } else {
      expect(commitLink).toHaveAttribute(
        "href",
        expect.stringMatching(
          /^https:\/\/github\.com\/competitive-intel\/compintel\/commit\/[0-9a-f]{7,64}$/,
        ),
      );
    }
    const repositoryLink = screen.getByRole("link", {
      name: "开源",
    });
    expect(repositoryLink).toHaveAttribute(
      "href",
      "https://github.com/competitive-intel/compintel",
    );
    expect(repositoryLink).toHaveAttribute("target", "_blank");
  });
});
