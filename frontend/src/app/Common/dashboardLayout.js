export const RESPONSIVE_DEFAULT_WIDGETS = [
  { id: "chat", wide: { x: 0, y: 0, w: 3, h: 5 } },
  { id: "calendar", wide: { x: 0, y: 5, w: 3, h: 5 } },
  { id: "messages", wide: { x: 3, y: 0, w: 6, h: 10 } },
  { id: "meet", wide: { x: 9, y: 0, w: 3, h: 5 } },
  { id: "docs", wide: { x: 9, y: 5, w: 3, h: 5 } },
  { id: "ocs", wide: { x: 0, y: 10, w: 12, h: 6 } },
  { id: "projects", wide: { x: 0, y: 16, w: 12, h: 5 } },
];

export const DEFAULT_WIDE = Object.fromEntries(
  RESPONSIVE_DEFAULT_WIDGETS.map(({ id, wide }) => [id, wide]),
);

export function orderDashboardWidgets(widgets) {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const ordered = RESPONSIVE_DEFAULT_WIDGETS.flatMap(({ id }) =>
    byId.has(id) ? [byId.get(id)] : [],
  );
  const known = new Set(RESPONSIVE_DEFAULT_WIDGETS.map(({ id }) => id));
  return [...ordered, ...widgets.filter(({ id }) => !known.has(id))];
}
