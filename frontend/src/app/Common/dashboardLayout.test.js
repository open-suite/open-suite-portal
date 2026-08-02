import { describe, expect, it } from "vitest";
import { buildLayouts } from "../page";
import { orderDashboardWidgets } from "./dashboardLayout";

describe("orderDashboardWidgets", () => {
  it("uses responsive default order and appends unknown widgets in backend order", () => {
    const widgets = [
      { id: "unknown-first" },
      { id: "ocs" },
      { id: "meet" },
      { id: "messages" },
      { id: "calendar" },
      { id: "unknown-second" },
      { id: "chat" },
    ];

    expect(orderDashboardWidgets(widgets).map(({ id }) => id)).toEqual([
      "chat",
      "calendar",
      "messages",
      "meet",
      "ocs",
      "unknown-first",
      "unknown-second",
    ]);
  });

  it("places unknown widgets left-to-right after curated wide widgets", () => {
    const layouts = buildLayouts({}, [
      "chat",
      "calendar",
      "messages",
      "meet",
      "docs",
      "ocs",
      "projects",
      "unknown-first",
      "unknown-second",
    ]);

    expect(
      layouts.lg
        .filter(({ i }) => i.startsWith("unknown"))
        .map(({ i, x, w }) => ({ i, x, w })),
    ).toEqual([
      { i: "unknown-first", x: 0, w: 6 },
      { i: "unknown-second", x: 6, w: 6 },
    ]);
  });
});
