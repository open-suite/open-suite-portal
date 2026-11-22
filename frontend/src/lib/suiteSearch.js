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
export async function searchSuite(query, applications, signal, onProgress) {
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
  const results = new Map();
  const failures = [];
  const pending = new Set(sources.map((source) => source.label));
  const snapshot = () => ({
    results: [...results.values()],
    failures: [...failures],
  });
  await Promise.all(
    sources.map(async (source) => {
      try {
        const response = await api.get(source.path, {
          params: source.params,
          signal,
        });
        const rows = response.data.results || [];
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
          if (url && !results.has(url))
            results.set(url, { ...item, url, source: source.label });
        });
      } catch {
        failures.push(source.label);
      }
      pending.delete(source.label);
      if (!signal?.aborted && pending.size) onProgress?.(snapshot(), pending);
    }),
  );
  return snapshot();
}
