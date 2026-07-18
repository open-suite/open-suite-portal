import React from "react";
import Documents from "../Components/AppWidgets/Documents/Documents";
import Drive from "../Components/AppWidgets/Drive/Drive";
import Files from "../Components/AppWidgets/Files/Files";
import Sheets from "../Components/AppWidgets/Sheets/Sheets";
import Conversations from "../Components/AppWidgets/Conversations/Conversations";
import Meet from "../Components/AppWidgets/Meet/Meet";
import Calendar from "../Components/AppWidgets/Calendar/Calendar";
import Email from "../Components/AppWidgets/Email/Email";

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
    .map((app) => ({
      id: app.id,
      title: app.title || app.id,
      node: React.createElement(WIDGET_COMPONENTS[app.id], {
        app,
        isAdmin: is_admin,
      }),
    }));
};
