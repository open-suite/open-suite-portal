import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Widget from "./Widget";

vi.mock("../../i18n/TranslationsProvider", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

describe("Widget", () => {
  it("replaces stale content with a request error", () => {
    render(
      <Widget
        app={{ id: "docs", title: "Documents", url: "/docs" }}
        error="Offline"
      >
        <span>Old result</span>
      </Widget>,
    );

    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
  });
});
