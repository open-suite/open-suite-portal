import api from "./axios";

export function safeWebUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

// Existing endpoints exchange the current user's token and enforce app permissions.
export async function searchSuite(query, applications, signal) {
  const sources = [
    { id: "ocs", label: "Files", path: "/ocs/search", params: { term: query } },
    {
      id: "docs",
      label: "Wiki",
      path: "/docs/documents",
      params: { title: query, page_size: 20 },
    },
  ].filter((source) =>
    applications.some((app) => app.id === source.id && app.url),
  );
  const responses = await Promise.allSettled(
    sources.map((source) =>
      api.get(source.path, { params: source.params, signal }),
    ),
  );
  const results = [],
    failures = [];
  responses.forEach((response, index) => {
    const source = sources[index];
    if (response.status === "rejected") {
      failures.push(source.label);
      return;
    }
    const rows = response.value.data.results || [];
    const items =
      source.id === "ocs"
        ? rows.flatMap((row) =>
            row.files.map((file) => ({
              title: file.name,
              url: file.link,
              detail: file.path,
            })),
          )
        : rows.map((doc) => ({
            title: doc.title || "Untitled page",
            url: doc.url,
            detail: doc.updated_date,
          }));
    items.forEach((item) => {
      const url = safeWebUrl(item.url);
      if (url && !results.some((result) => result.url === url))
        results.push({ ...item, url, source: source.label });
    });
  });
  return { results, failures };
}
