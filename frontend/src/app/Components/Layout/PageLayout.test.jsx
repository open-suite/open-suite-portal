import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PageLayout from "./PageLayout";

vi.mock("antd", () => {
  const Layout = ({ children }) => <div>{children}</div>;
  Layout.Content = ({ children }) => <main>{children}</main>;
  Layout.Footer = ({ children }) => <footer>{children}</footer>;
  return {
    FloatButton: () => null,
    Layout,
  };
});

vi.mock("./Components/HeaderLayout", () => ({
  default: ({ isAdmin, profile }) => (
    <div data-admin={String(isAdmin)} data-testid="header">
      {profile}
    </div>
  ),
}));

vi.mock("../Context/AppContext", () => ({
  useAppContext: () => ({
    appConfig: { applications: [], is_admin: true },
    error: null,
  }),
}));

vi.mock("@/app/Common/CustomHooks/useFetchWithRefresh", () => ({
  useFetchWithRefresh: () => ({ data: { name: "Ada" } }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("../../../i18n/TranslationsProvider", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("@/app/Common/ExternalApp", () => ({
  default: () => null,
}));

vi.mock("@ant-design/icons", () => ({
  MessageOutlined: () => null,
}));

describe("PageLayout", () => {
  it("passes the server admin flag to shared navigation", () => {
    render(<PageLayout>Dashboard</PageLayout>);

    expect(screen.getByTestId("header")).toHaveAttribute("data-admin", "true");
    expect(screen.getByTestId("header")).toHaveTextContent("Ada");
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
