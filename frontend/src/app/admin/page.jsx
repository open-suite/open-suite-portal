"use client";
import { Card, Input, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "../Components/Context/AppContext";
import { safeWebUrl } from "@/lib/suiteSearch";
import "../suite-tools.css";

function identityConsole(accountUrl) {
  const safe = safeWebUrl(accountUrl);
  if (!safe) return null;
  const url = new URL(safe);
  const match = url.pathname.match(/^(.*)\/realms\/([^/]+)\/account\/?$/);
  return match
    ? `${url.origin}${match[1]}/admin/${match[2]}/console/#/${match[2]}`
    : null;
}

export default function Admin() {
  const { appConfig } = useAppContext();
  const router = useRouter();
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (appConfig && !appConfig.is_admin) router.replace("/");
  }, [appConfig, router]);
  if (!appConfig?.is_admin) return null;
  const apps = (appConfig.applications || []).filter((app) =>
    safeWebUrl(app.url),
  );
  const consoleUrl = identityConsole(appConfig.redirect_to_account_page);
  const filesUrl = apps.find((app) => app.id === "ocs")?.url;
  const actions = [
    {
      title: "People & access",
      description:
        "Add people, reset passwords, and disable accounts in the identity console.",
      url: consoleUrl && `${consoleUrl}/users`,
      action: "Manage people",
    },
    {
      title: "Groups",
      description: "Manage group membership and role assignments in Keycloak.",
      url: consoleUrl && `${consoleUrl}/groups`,
      action: "Manage groups",
    },
    {
      title: "Files & storage",
      description:
        "Manage storage quotas, sharing policies, and file settings in Nextcloud.",
      url: filesUrl && `${filesUrl.replace(/\/$/, "")}/settings/admin`,
      action: "Manage storage",
    },
    {
      title: "Support",
      description: "Open your organisation’s helpdesk for workspace support.",
      url: safeWebUrl(appConfig.helpdesk_url),
      action: "Open helpdesk",
    },
  ];
  const visible = apps.filter((app) =>
    `${app.title} ${app.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="suite-tools">
      <div className="suite-hero">
        <span className="suite-eyebrow">WORKSPACE MANAGEMENT</span>
        <Typography.Title>Admin Portal</Typography.Title>
        <Typography.Paragraph>
          People, applications, and settings. A clear starting point for looking
          after your workspace.
        </Typography.Paragraph>
        <Tag color="blue">{apps.length} configured applications</Tag>
        <Tag>Administrator</Tag>
      </div>
      <div className="suite-card-grid">
        {actions.map((item) => (
          <Card key={item.title} title={item.title}>
            <p>{item.description}</p>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.action} ↗
              </a>
            ) : (
              <Typography.Text type="secondary">
                Not configured for this workspace
              </Typography.Text>
            )}
          </Card>
        ))}
      </div>
      <div className="suite-section-heading">
        <Typography.Title level={2}>Applications</Typography.Title>
        <Input.Search
          aria-label="Filter applications"
          placeholder="Find an application"
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="suite-card-grid">
        {visible.map((app) => (
          <Card key={app.id} title={app.title || app.id}>
            <Typography.Paragraph type="secondary">
              {new URL(app.url).hostname}
            </Typography.Paragraph>
            <a href={app.url} target="_blank" rel="noopener noreferrer">
              Open application ↗
            </a>
            {app.id === "ocs" && (
              <p>
                <a
                  href={`${app.url.replace(/\/$/, "")}/settings/admin`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Application settings ↗
                </a>
              </p>
            )}
          </Card>
        ))}
      </div>
      {!visible.length && (
        <Typography.Paragraph>
          No applications match “{query}”.
        </Typography.Paragraph>
      )}
      <Typography.Paragraph type="secondary" className="suite-footnote">
        Management consoles open in a new tab and enforce their own
        administrator permissions.
      </Typography.Paragraph>
    </section>
  );
}
