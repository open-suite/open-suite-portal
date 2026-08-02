import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PageLayout from "./PageLayout";

let appContext;
let profileState;

vi.mock("antd", () => {
  function Layout({ children }) {
    return <div>{children}</div>;
  }
  function Content({ children }) {
    return <main>{children}</main>;
  }
  function Footer({ children }) {
    return <footer>{children}</footer>;
  }
  Layout.Content = Content;
  Layout.Footer = Footer;
  return {
    FloatButton: () => null,
    Layout,
  };
});

vi.mock("./Components/HeaderLayout", () => ({
  default: ({ isAdmin, isProfile, profile }) => (
    <header
      data-admin={String(isAdmin)}
      data-placeholder={String(isProfile)}
      data-testid="header"
    >
      {profile}
    </header>
  ),
}));

vi.mock("../Context/AppContext", () => ({
  useAppContext: () => appContext,
}));

vi.mock("@/app/Common/CustomHooks/useFetchWithRefresh", () => ({
  useFetchWithRefresh: () => profileState,
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

vi.mock("@/app/Common/ErrorResult", () => ({
  default: ({ title }) => <div>{title}</div>,
}));

vi.mock("@/lib/silentLogin", () => ({
  nativeLoginRetryUrl: () => "/api/v1/auth/login?retry",
}));

describe("PageLayout", () => {
  beforeEach(() => {
    appContext = {
      appConfig: { applications: [], is_admin: true },
      authFailure: false,
      error: null,
      loading: false,
    };
    profileState = { data: { name: "Ada" }, error: "", loading: false };
  });

  it("passes the server admin flag to shared navigation", () => {
    render(<PageLayout>Dashboard</PageLayout>);

    expect(screen.getByTestId("header")).toHaveAttribute("data-admin", "true");
    expect(screen.getByTestId("header")).toHaveTextContent("Ada");
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("keeps one stable full header while bootstrap and handled auth states replace only content", () => {
    appContext = {
      appConfig: null,
      authFailure: false,
      error: null,
      loading: true,
    };
    const { rerender } = render(<PageLayout>Dashboard</PageLayout>);
    const header = screen.getByTestId("header");

    expect(header).toHaveAttribute("data-placeholder", "true");
    expect(screen.getByLabelText("Loading Open Suite")).toBeInTheDocument();

    appContext = {
      appConfig: { applications: [], is_admin: true },
      authFailure: false,
      error: null,
      loading: false,
    };
    rerender(<PageLayout>Dashboard</PageLayout>);

    expect(screen.getByTestId("header")).toBe(header);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();

    appContext = {
      appConfig: null,
      authFailure: true,
      error: { status: 401 },
      loading: false,
    };
    rerender(<PageLayout>Dashboard</PageLayout>);

    expect(screen.getByTestId("header")).toBe(header);
    expect(screen.getByText("failedTitle")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("keeps the reserved header controls until the profile request settles", () => {
    profileState = { data: [], error: "", loading: true };

    render(<PageLayout>Dashboard</PageLayout>);

    expect(screen.getByTestId("header")).toHaveAttribute(
      "data-placeholder",
      "true",
    );
  });
});
