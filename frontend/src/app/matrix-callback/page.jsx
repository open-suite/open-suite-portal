"use client";
import { useEffect, useState } from "react";
import { MessageOutlined } from "@ant-design/icons";
import { Result } from "antd";
import { exchangeLoginToken } from "@/lib/matrix";

export function returnToDashboard(location) {
  location.replace("/");
}

// Lands here after Synapse's SSO redirect with ?loginToken=… , exchanges it for
// a Matrix token, then returns to the dashboard.
export default function MatrixCallback() {
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("loginToken");
    Promise.resolve()
      .then(() => {
        if (!token) throw new Error("No login token returned.");
        return exchangeLoginToken(token);
      })
      // This app is served as a static export. Next's client router fetches
      // /index.txt here but does not leave /matrix-callback in production.
      .then(() => returnToDashboard(window.location))
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Result
        status="warning"
        title="Chat connection failed"
        subTitle={error}
      />
    );
  }
  return <Result icon={<MessageOutlined />} title="Connecting to chat…" />;
}
