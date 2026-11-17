"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Card,
  Empty,
  Input,
  Segmented,
  Spin,
  Tag,
  Typography,
} from "antd";
import { FileTextOutlined, SearchOutlined } from "@ant-design/icons";
import { useAppContext } from "../Components/Context/AppContext";
import { searchSuite } from "@/lib/suiteSearch";
import "../suite-tools.css";

export default function SearchPage() {
  const { appConfig } = useAppContext();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search(value) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const term = value.trim();
    setState(null);
    setLoading(Boolean(term));
    if (!term) return;
    const response = await searchSuite(
      term,
      appConfig?.applications || [],
      controller.signal,
    );
    if (controller.signal.aborted) return;
    setState({ ...response, term });
    setLoading(false);
  }
  const results =
    state?.results.filter(
      (item) => filter === "All" || item.source === filter,
    ) || [];
  return (
    <section className="suite-tools">
      <div className="suite-hero">
        <span className="suite-eyebrow">YOUR WORK, TOGETHER</span>
        <Typography.Title>Find your next starting point</Typography.Title>
        <Typography.Paragraph>
          Search file names and Wiki page titles in one place. Results follow
          your existing access permissions.
        </Typography.Paragraph>
        <Input.Search
          aria-label="Search Files and Wiki"
          placeholder="Search Files and Wiki…"
          size="large"
          enterButton="Search"
          allowClear
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            request.current?.abort();
            setLoading(false);
            setState(null);
          }}
          onSearch={search}
          loading={loading}
        />
      </div>
      <Segmented
        aria-label="Filter search results"
        options={["All", "Files", "Wiki"]}
        value={filter}
        onChange={setFilter}
      />
      <div aria-live="polite" className="suite-results">
        {loading && (
          <div className="suite-empty">
            <Spin />
            <p>Searching your workspace…</p>
          </div>
        )}
        {state?.failures.length > 0 && (
          <Alert
            type="warning"
            showIcon
            title={`${state.failures.join(" and ")} could not be searched. Try again to include those results.`}
          />
        )}
        {state && (
          <Typography.Paragraph type="secondary">
            {results.length} results shown for “{state.term}” · Up to 20 Wiki
            pages
          </Typography.Paragraph>
        )}
        {results.map((item) => (
          <a className="suite-result" key={item.url} href={item.url}>
            <FileTextOutlined />
            <div>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </div>
            <Tag>{item.source}</Tag>
            <span aria-hidden="true">↗</span>
          </a>
        ))}
        {state && !results.length && (
          <Empty
            description={
              state.failures.length
                ? "No results from the available sources"
                : "No matches. Try a shorter name or another keyword."
            }
          />
        )}
        {!state && !loading && (
          <Card className="suite-empty">
            <SearchOutlined style={{ fontSize: 32 }} />
            <Typography.Title level={3}>
              Less switching. More finding.
            </Typography.Title>
            <p>Look up a proposal, meeting note, or shared file.</p>
          </Card>
        )}
      </div>
    </section>
  );
}
