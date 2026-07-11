"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageOutlined } from "@ant-design/icons";
import { Result } from "antd";
import { exchangeLoginToken } from "@/lib/matrix";

// Lands here after Synapse's SSO redirect with ?loginToken=… , exchanges it for
// a Matrix token, then returns to the dashboard.
export default function MatrixCallback() {
  const router = useRouter();
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("loginToken");
    Promise.resolve()
      .then(() => {
        if (!token) throw new Error("No login token returned.");
        return exchangeLoginToken(token);
      })
      .then(() => router.replace("/"))
      .catch((e) => setError(e.message));
  }, [router]);

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
