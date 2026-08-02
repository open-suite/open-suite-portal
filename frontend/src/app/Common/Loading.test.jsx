import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RESPONSIVE_DEFAULT_WIDGETS } from "./dashboardLayout";
import Loading from "./Loading";

describe("Loading", () => {
  it("reserves the curated first dashboard viewport geometry", () => {
    const { container } = render(<Loading />);

    expect(
      Array.from(container.querySelectorAll("[data-widget-id]")).map((slot) => [
        slot.dataset.widgetId,
        slot.dataset.grid,
      ]),
    ).toEqual(
      RESPONSIVE_DEFAULT_WIDGETS.map(({ id, wide: { x, y, w, h } }) => [
        id,
        `${x},${y},${w},${h}`,
      ]),
    );
  });
});
