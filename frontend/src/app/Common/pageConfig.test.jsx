import { describe, expect, it } from "vitest";
import { dashboardWidgets } from "./pageConfig";

describe("dashboardWidgets", () => {
  it("registers Projects alongside Files and keeps Grist separate", () => {
    const widgets = dashboardWidgets({
      applications: [
        {
          id: "ocs",
          title: "Nextcloud",
          url: "https://cloud.test/",
          enabled: true,
        },
        {
          id: "grist",
          title: "Grist",
          url: "https://grist.test",
          enabled: true,
        },
      ],
    });

    expect(widgets.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "ocs", title: "Files" },
      { id: "grist", title: "Grist" },
      { id: "projects", title: "Projects" },
    ]);
    const projects = widgets.find((widget) => widget.id === "projects");
    expect(projects.node.props.app).toMatchObject({
      id: "projects",
      title: "Projects",
      url: "https://cloud.test/apps/deck/",
      iframe: false,
    });
  });
});
