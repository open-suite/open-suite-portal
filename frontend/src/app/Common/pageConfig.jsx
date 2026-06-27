import React from "react";
import Link from "next/link";
import DynamicIcon from "./DynamicIcon";
import Documents from "../Components/AppWidgets/Documents/Documents";
import Drive from "../Components/AppWidgets/Drive/Drive";
import Files from "../Components/AppWidgets/Files/Files";
import Sheets from "../Components/AppWidgets/Sheets/Sheets";
import Conversations from "../Components/AppWidgets/Conversations/Conversations";
import Meet from "../Components/AppWidgets/Meet/Meet";
import Calendar from "../Components/AppWidgets/Calendar/Calendar";

// Curated top-bar layout. The order of entries here is the order shown in the
// bar. `labelKey` resolves against the "Navigation" i18n namespace, overriding
// the backend-provided app.title so we control the display names (e.g. the
// "matrix" service is shown as "Chat"). `icon` is an @ant-design/icons name.
const NAV_LAYOUT = [
  // Office is a dropdown grouping NextCloud (the "ocs" service). See OFFICE_LINKS.
  {
    type: "office",
    appId: "ocs",
    labelKey: "office",
    icon: "AppstoreOutlined",
  },
  {
    type: "nextcloud",
    appId: "ocs",
    id: "contacts",
    labelKey: "contacts",
    icon: "ContactsOutlined",
    path: "/apps/contacts",
  },
  {
    type: "nextcloud",
    appId: "ocs",
    id: "projects",
    labelKey: "projects",
    icon: "ProjectOutlined",
    path: "/apps/deck/",
  },
  { type: "app", appId: "meet", labelKey: "meet", icon: "VideoCameraOutlined" },
  { type: "app", appId: "matrix", labelKey: "chat", icon: "MessageOutlined" },
  { type: "app", appId: "grist", labelKey: "tables", icon: "TableOutlined" },
  { type: "app", appId: "docs", labelKey: "wiki", icon: "ReadOutlined" },
  {
    type: "app",
    appId: "calendar",
    labelKey: "calendar",
    icon: "CalendarOutlined",
  },
];

// Backend services to keep out of the top bar entirely.
const HIDDEN_NAV = new Set(["task"]);

// Children of the Office dropdown. Document-type entries use the clean Office
// section URLs served by the shared header sidecar.
const OFFICE_LINKS = [
  {
    id: "documents",
    labelKey: "documents",
    icon: "FileTextOutlined",
    path: "/apps/office/documents",
  },
  {
    id: "spreadsheets",
    labelKey: "spreadsheets",
    icon: "TableOutlined",
    path: "/apps/office/spreadsheets",
  },
  {
    id: "presentations",
    labelKey: "presentations",
    icon: "FilePptOutlined",
    path: "/apps/office/presentations",
  },
  {
    id: "diagrams",
    labelKey: "diagrams",
    icon: "ApartmentOutlined",
    path: "/apps/office/diagrams",
  },
  {
    id: "files",
    labelKey: "files",
    icon: "FolderOutlined",
    path: "/apps/files/files",
  },
];

const label = (t, key, fallback) => (t ? t(key) : fallback);

const nextcloudLaunchUrl = (base, path) => {
  const origin = base.replace(/\/$/, "");
  const target = `${origin}${path}`;
  return `${origin}/apps/user_oidc/login/1?redirectUrl=${encodeURIComponent(target)}`;
};

// Link to an app: embedded (iframe) apps route internally to /{id}, others open
// the external URL in a new tab — matching the original behaviour.
const appLink = (app, text) =>
  app.iframe ? (
    <Link href={`/${app.id}`}>{text}</Link>
  ) : (
    <Link href={app.url} rel="noopener noreferrer" target="_blank">
      {text}
    </Link>
  );

export const menuItem = (applications, t) => {
  const apps = applications?.filter((app) => app?.url) ?? [];
  const byId = Object.fromEntries(apps.map((app) => [app.id, app]));
  const placed = new Set();

  const curated = NAV_LAYOUT.map((entry) => {
    const app = byId[entry.appId];
    if (!app) return null;
    placed.add(entry.appId);

    if (entry.type === "office") {
      // Dropdown: children deep-link into the NextCloud base URL.
      const base = app.url.replace(/\/$/, "");
      return {
        key: entry.appId,
        label: label(t, entry.labelKey, "Office"),
        icon: <DynamicIcon name={entry.icon} />,
        children: OFFICE_LINKS.map((child) => ({
          key: `${entry.appId}:${child.id}`,
          label: (
            <Link
              href={nextcloudLaunchUrl(base, child.path)}
              rel="noopener noreferrer"
              target="_blank"
            >
              {label(t, child.labelKey, child.id)}
            </Link>
          ),
          icon: <DynamicIcon name={child.icon} />,
        })),
      };
    }

    if (entry.type === "nextcloud") {
      const base = app.url.replace(/\/$/, "");
      return {
        key: `${entry.appId}:${entry.id}`,
        label: (
          <Link
            href={nextcloudLaunchUrl(base, entry.path)}
            rel="noopener noreferrer"
            target="_blank"
          >
            {label(t, entry.labelKey, entry.id)}
          </Link>
        ),
        icon: <DynamicIcon name={entry.icon} />,
      };
    }

    return {
      key: app.id,
      label: appLink(app, label(t, entry.labelKey, app.title)),
      icon: <DynamicIcon name={entry.icon} />,
    };
  }).filter(Boolean);

  // Append any other enabled apps not explicitly placed above, so nothing the
  // backend exposes silently disappears from the bar. These keep their
  // backend-provided title and icon.
  const remaining = apps
    .filter(
      (app) => app.title && !placed.has(app.id) && !HIDDEN_NAV.has(app.id),
    )
    .map((app) => ({
      key: app.id,
      label: appLink(app, app.title),
      icon: <DynamicIcon name={app.icon} />,
    }));

  return [
    {
      key: "home",
      label: <Link href={"/"}>{label(t, "home", "Home")}</Link>,
      icon: <DynamicIcon name={"HomeOutlined"} />,
    },
    ...curated,
    ...remaining,
  ];
};

const WIDGET_COMPONENTS = {
  docs: Documents,
  drive: Drive,
  ocs: Files,
  grist: Sheets,
  conversation: Conversations,
  meet: Meet,
  calendar: Calendar,
};

// All dashboard widgets the current config can show, as { id, title, node }.
// The dashboard decides which are visible and lets the user add/remove them.
export const dashboardWidgets = (appConfig) => {
  const { applications, is_admin } = appConfig || {};
  return (applications || [])
    .filter((app) => app.enabled && WIDGET_COMPONENTS[app.id])
    .map((app) => ({
      id: app.id,
      title: app.title || app.id,
      node: React.createElement(WIDGET_COMPONENTS[app.id], {
        app,
        isAdmin: is_admin,
      }),
    }));
};
