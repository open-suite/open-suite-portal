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

// Keep a visible link in its slot as each source confirms or withdraws it.
function reconcilePreview(preview, results, pending) {
  if (!preview.length) return results;
  const fresh = new Map(results.map((item) => [item.url, item]));
  const ordered = [];
  for (const item of preview) {
    if (fresh.has(item.url)) {
      ordered.push(fresh.get(item.url));
      fresh.delete(item.url);
    } else if (pending?.has(item.source)) ordered.push(item);
  }
  return [...ordered, ...fresh.values()];
}

export default function SearchPage() {
  const { appConfig } = useAppContext();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(null);
  // Only the last completed search in this mounted page can supply previews.
  const lastSearch = useRef(null);
  function recentMatches(term) {
    const last = lastSearch.current;
    const prefix = term.trim().toLowerCase();
    if (
      !last ||
      performance.now() - last.at > 30000 ||
      !prefix.startsWith(last.prefix)
    )
      return [];
    return last.results.filter((item) =>
      item.title?.toLowerCase().includes(prefix),
    );
  }
  useEffect(() => () => request.current?.abort(), []);
  async function search(value) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const term = value.trim();
    const preview = recentMatches(term);
    lastSearch.current = null;
    setState(
      preview.length
        ? { results: preview, failures: [], term, partial: true }
        : null,
    );
    setLoading(Boolean(term));
    if (!term) return;
    const response = await searchSuite(
      term,
      appConfig?.applications || [],
      controller.signal,
      (partial, pending) => {
        setState({
          ...partial,
          term,
          partial: true,
          results: reconcilePreview(preview, partial.results, pending),
        });
      },
    );
    if (controller.signal.aborted) return;
    const results = reconcilePreview(preview, response.results);
    lastSearch.current = {
      prefix: term.toLowerCase(),
      results,
      at: performance.now(),
    };
    setState({ ...response, results, term });
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
            const value = event.target.value;
            setQuery(value);
            request.current?.abort();
            setLoading(false);
            const matches = recentMatches(value);
            setState(
              matches.length
                ? {
                    results: matches,
                    failures: [],
                    term: value.trim(),
                    partial: true,
                  }
                : null,
            );
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
        {loading && !results.length && (
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
        {state && !state.partial && (
          <Typography.Paragraph type="secondary">
            {results.length} results shown for “{state.term}” · Up to 20 Wiki
            pages
          </Typography.Paragraph>
        )}
        {state?.partial && results.length > 0 && (
          <Typography.Paragraph type="secondary">
            {loading
              ? "Searching remaining sources…"
              : "Matches from your last search · Press Enter to search all sources"}
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
        {state && !state.partial && !results.length && (
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
