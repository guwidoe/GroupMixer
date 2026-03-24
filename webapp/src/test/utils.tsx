import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

interface RenderWithRouterOptions extends Omit<RenderOptions, "wrapper"> {
  route?: string;
}

export function renderWithRouter(
  ui: ReactElement,
  { route = "/", ...options }: RenderWithRouterOptions = {}
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    ),
    ...options,
  });
}
