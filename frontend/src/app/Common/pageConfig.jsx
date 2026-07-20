import React from "react";
import Documents from "../Components/AppWidgets/Documents/Documents";
import Drive from "../Components/AppWidgets/Drive/Drive";
import Files from "../Components/AppWidgets/Files/Files";
import Sheets from "../Components/AppWidgets/Sheets/Sheets";
import Conversations from "../Components/AppWidgets/Conversations/Conversations";
import Meet from "../Components/AppWidgets/Meet/Meet";
import Calendar from "../Components/AppWidgets/Calendar/Calendar";
import Email from "../Components/AppWidgets/Email/Email";

// Open Suite never shows a vendor product name for an app — always our own
// label. Overrides the backend-provided app.title (used for the widget header
// and its search placeholder). Add an entry here rather than let a vendor name
// leak through.
const WIDGET_TITLES = {
  ocs: "Files",
};

const WIDGET_COMPONENTS = {
  docs: Documents,
  drive: Drive,
  ocs: Files,
  grist: Sheets,
  conversation: Conversations,
  meet: Meet,
  calendar: Calendar,
  messages: Email,
};

// All dashboard widgets the current config can show, as { id, title, node }.
// The dashboard decides which are visible and lets the user add/remove them.
export const dashboardWidgets = (appConfig) => {
  const { applications, is_admin } = appConfig || {};
  return (applications || [])
    .filter((app) => app.enabled && WIDGET_COMPONENTS[app.id])
    .map((app) => {
      const title = WIDGET_TITLES[app.id] || app.title || app.id;
      return {
        id: app.id,
        title,
        // Pass the display title down so the widget header and its search
        // placeholder use our label, not the vendor's.
        node: React.createElement(WIDGET_COMPONENTS[app.id], {
          app: { ...app, title },
          isAdmin: is_admin,
        }),
      };
    });
};
