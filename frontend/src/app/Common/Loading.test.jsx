import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_WIDE } from "../page";
import Loading, { BOOTSTRAP_LAYOUT } from "./Loading";

describe("Loading", () => {
  it("reserves the curated first dashboard viewport geometry", () => {
    const { container } = render(<Loading />);

    expect(BOOTSTRAP_LAYOUT).toEqual(DEFAULT_WIDE);
    expect(
      Array.from(container.querySelectorAll("[data-widget-id]")).map((slot) => [
        slot.dataset.widgetId,
        slot.dataset.grid,
      ]),
    ).toEqual(
      Object.entries(DEFAULT_WIDE).map(([id, { x, y, w, h }]) => [
        id,
        `${x},${y},${w},${h}`,
      ]),
    );
  });
});
