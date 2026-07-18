import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Admin from "./page";

const state = vi.hoisted(() => ({
  appConfig: null,
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));

vi.mock("../Components/Context/AppContext", () => ({
  useAppContext: () => ({ appConfig: state.appConfig }),
}));

vi.mock("../../i18n/TranslationsProvider", () => ({
  useTranslations: () => (key) =>
    ({ title: "Admin Portal", description: "Manage applications" })[key] || key,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

describe("Admin", () => {
  beforeEach(() => {
    state.replace.mockReset();
  });

  it("renders the admin portal for the server is_admin contract", () => {
    state.appConfig = {
      is_admin: true,
      applications: [
        { id: "docs", title: "Documents", url: "https://docs.example.test" },
      ],
    };

    render(<Admin />);

    expect(screen.getByText("Admin Portal")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /docs.example.test/ }),
    ).toHaveAttribute("href", "https://docs.example.test/admin");
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("redirects non-admin users home", async () => {
    state.appConfig = { is_admin: false, applications: [] };

    render(<Admin />);

    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("Admin Portal")).not.toBeInTheDocument();
  });
});
