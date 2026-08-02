import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMatrixSession } from "@/lib/matrix";
import HeaderLayout from "./HeaderLayout";

vi.mock("next/link", () => ({
  default: ({ children, onClick, ...props }) => (
    <a
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("../../../../i18n/TranslationsProvider", () => ({
  useTranslations: (namespace) => (key) =>
    ({
      HomePage: { title: "Open Suite", logout: "Logout" },
      Header: { myAccount: "My Account" },
      Navigation: { admin: "Admin" },
      Theme: { dark: "Dark Mode", light: "Light Mode" },
    })[namespace]?.[key] || key,
}));

vi.mock("../../Context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("@/lib/matrix", () => ({
  clearMatrixSession: vi.fn(),
}));

describe("HeaderLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides home and logout navigation and clears the app session on logout", () => {
    render(
      <HeaderLayout
        isProfile={false}
        profile="Ada"
        redirectUrl="https://account.example.test"
      />,
    );

    expect(screen.getByRole("link", { name: "Open Suite" })).toHaveAttribute(
      "href",
      "/",
    );
    const logout = screen.getByRole("link", { name: "Logout" });
    expect(logout).toHaveAttribute("href", "/api/v1/auth/logout");

    fireEvent.click(logout);

    expect(clearMatrixSession).toHaveBeenCalledOnce();
  });

  it("shows the admin destination to administrators", async () => {
    const user = userEvent.setup();
    render(
      <HeaderLayout
        isProfile={false}
        isAdmin
        profile="Ada"
        redirectUrl="https://account.example.test"
      />,
    );

    await user.click(screen.getByRole("link", { name: /Ada/ }));

    expect(await screen.findByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.getByRole("link", { name: "My Account" })).toHaveAttribute(
      "href",
      "https://account.example.test",
    );
  });

  it("reserves profile and logout geometry while authentication is handled", () => {
    const { container } = render(<HeaderLayout isProfile />);

    expect(
      screen.getByRole("link", { name: "Open Suite" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".portal-header-placeholder.profile-link"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".portal-header-placeholder.logout-link"),
    ).toBeInTheDocument();
  });

  it("keeps the same header node when affixing changes", () => {
    const { container, rerender } = render(
      <HeaderLayout isAffixHeader={false} />,
    );
    const header = container.querySelector("header");

    rerender(<HeaderLayout isAffixHeader />);

    expect(container.querySelector("header")).toBe(header);
    expect(header.parentElement).toHaveClass("portal-header-affix");
  });
});
