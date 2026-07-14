import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ThemeProvider } from "../lib/theme";

type RenderOptions = {
  route?: string;
  routePath?: string;
};

export function renderWithProviders(
  element: ReactElement,
  { route = "/", routePath }: RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const content =
    routePath === undefined ? (
      element
    ) : (
      <Routes>
        <Route path={routePath} element={element} />
      </Routes>
    );
  const result = render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{content}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { ...result, queryClient };
}
