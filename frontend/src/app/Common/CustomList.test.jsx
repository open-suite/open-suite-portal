import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CustomList from "./CustomList";

vi.mock("@/i18n/TranslationsProvider", () => ({
  useTranslations: () => (key) =>
    ({ empty: "No items found", emptyData: "No data available" })[key] || key,
}));

describe("CustomList", () => {
  it("shows loading rather than an empty state during the initial request", () => {
    const { container } = render(
      <CustomList loading dataSource={[]} renderItem={() => null} />,
    );

    expect(container.querySelector(".custom-list-loading")).toBeInTheDocument();
    expect(screen.queryByText("No data available")).not.toBeInTheDocument();
  });

  it("distinguishes empty data from empty search results", () => {
    const { rerender } = render(
      <CustomList dataSource={[]} renderItem={() => null} />,
    );
    expect(screen.getByText("No data available")).toBeInTheDocument();

    rerender(<CustomList dataSource={[]} search="missing" renderItem={() => null} />);
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  it("renders returned items", () => {
    render(
      <CustomList
        dataSource={[{ id: 1, name: "Quarterly report" }]}
        renderItem={(item) => <span key={item.id}>{item.name}</span>}
      />,
    );

    expect(screen.getByText("Quarterly report")).toBeInTheDocument();
  });
});
