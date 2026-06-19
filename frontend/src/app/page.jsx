"use client";
import { useEffect, useMemo, useState } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Button, Dropdown, Empty } from "antd";
import { HolderOutlined, PlusOutlined } from "@ant-design/icons";
import { useAppContext } from "./Components/Context/AppContext";
import { DashboardContext } from "./Components/Context/DashboardContext";
import { dashboardWidgets } from "./Common/pageConfig";
import Chat from "./Components/AppWidgets/Chat/Chat";
import { useTranslations } from "../i18n/TranslationsProvider";

const ResponsiveGrid = WidthProvider(Responsive);
const LAYOUT_KEY = "dashboard_layout_v3";
const REMOVED_KEY = "dashboard_removed";
const COLS = { lg: 12, md: 12, sm: 6, xs: 6, xxs: 6 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ONE_COL = new Set(["sm", "xs", "xxs"]);
const WIDGET_H = 5; // default widget height (rows) — compact by default

// Build a complete layout for every breakpoint: reuse the saved position/size
// for items we've seen, and drop in a compact default for anything new (a
// just-added widget). Keeps the grid fully controlled so saved sizes survive
// refreshes and new items never come in at 1x1.
function buildLayouts(saved, ids) {
  const out = {};
  for (const bp of Object.keys(COLS)) {
    const perRow = ONE_COL.has(bp) ? 1 : 2;
    const w = 12 / perRow;
    const existing = Object.fromEntries(
      (saved?.[bp] || []).map((l) => [l.i, l]),
    );
    out[bp] = ids.map((id, i) =>
      existing[id]
        ? existing[id]
        : { i: id, x: (i % perRow) * w, y: 9999, w, h: WIDGET_H, minH: 3 },
    );
  }
  return out;
}

// A small "+" control in the top-right of the dashboard (not the app header,
// not a grid widget). Clicking it lists the widgets you can add, or says
// everything's already added.
function AddWidgetControl({ addable, onAdd, t }) {
  const items = addable.length
    ? addable.map((w) => ({
        key: w.id,
        label: w.title,
        onClick: () => onAdd(w.id),
      }))
    : [{ key: "__none__", label: t("allAdded"), disabled: true }];
  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
      <Button
        shape="circle"
        size="small"
        icon={<PlusOutlined />}
        title={t("addWidget")}
        aria-label={t("addWidget")}
      />
    </Dropdown>
  );
}

export default function Home() {
  const { appConfig } = useAppContext();
  const tChat = useTranslations("Chat");
  const tDash = useTranslations("Dashboard");

  // Every widget the current config can show. Chat first, then app widgets.
  const universe = useMemo(
    () => [
      { id: "chat", title: tChat("title"), node: <Chat /> },
      ...dashboardWidgets(appConfig),
    ],
    [appConfig, tChat],
  );

  // null until localStorage is read (avoids a flash before hydration).
  const [removed, setRemoved] = useState(null);
  const [layouts, setLayouts] = useState(null);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setRemoved(JSON.parse(localStorage.getItem(REMOVED_KEY)) || []);
      } catch {
        setRemoved([]);
      }
      try {
        setLayouts(JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {});
      } catch {
        setLayouts({});
      }
    });
  }, []);

  const persistRemoved = (next) => {
    setRemoved(next);
    try {
      localStorage.setItem(REMOVED_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };
  const dashboard = useMemo(
    () => ({
      removeWidget: (id) =>
        persistRemoved([...new Set([...(removed || []), id])]),
    }),
    [removed],
  );
  const addWidget = (id) =>
    persistRemoved((removed || []).filter((x) => x !== id));

  if (removed === null || layouts === null) return null;
  if (!universe.length) {
    return <Empty description={tDash("noApps")} style={{ marginTop: 80 }} />;
  }

  const visible = universe.filter((w) => !removed.includes(w.id));
  const addable = universe.filter((w) => removed.includes(w.id));
  const effective = buildLayouts(
    layouts,
    visible.map((it) => it.id),
  );

  const onLayoutChange = (_current, all) => {
    setLayouts(all);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
  };

  return (
    <DashboardContext.Provider value={dashboard}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "8px 8px 0",
        }}
      >
        <AddWidgetControl addable={addable} onAdd={addWidget} t={tDash} />
      </div>
      <ResponsiveGrid
        className="dashboard-grid"
        layouts={effective}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={36}
        margin={[16, 16]}
        draggableHandle=".widget-drag-handle"
        compactType="vertical"
        onLayoutChange={onLayoutChange}
      >
        {visible.map((it) => (
          <div key={it.id} className="dashboard-item">
            <span className="widget-drag-handle" title="Drag to rearrange">
              <HolderOutlined />
            </span>
            {it.node}
          </div>
        ))}
      </ResponsiveGrid>
    </DashboardContext.Provider>
  );
}
