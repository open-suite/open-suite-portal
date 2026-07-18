import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Meet from "./Meet";

vi.mock("@/app/Common/CustomHooks/useFetchWithRefresh", () => ({
  useFetchWithRefresh: () => ({
    data: [],
    loading: true,
    error: "",
    onRefresh: vi.fn(),
  }),
}));

vi.mock("@/app/Common/Widget", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/app/Common/CustomList", () => ({
  default: ({ loading }) => (
    <div data-loading={String(loading)} data-testid="meet-list" />
  ),
}));

vi.mock("@/i18n/TranslationsProvider", () => ({
  useTranslations: () => (key) => key,
}));

describe("Meet", () => {
  it("keeps the room list in its loading state during the initial request", () => {
    render(<Meet app={{ id: "meet", title: "Meet" }} />);

    expect(screen.getByTestId("meet-list")).toHaveAttribute(
      "data-loading",
      "true",
    );
  });
});
