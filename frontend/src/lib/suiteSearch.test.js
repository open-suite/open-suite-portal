import { describe, expect, it, vi, beforeEach } from "vitest";
import api from "./axios";
import { searchSuite, safeWebUrl } from "./suiteSearch";
vi.mock("./axios", () => ({ default: { get: vi.fn() } }));
const apps = [
  { id: "ocs", url: "https://files.test" },
  { id: "docs", url: "https://wiki.test" },
];
beforeEach(() => vi.clearAllMocks());
describe("suite search", () => {
  it("combines permission-scoped results and deduplicates files", async () => {
    const file = { name: "Budget", link: "https://files.test/f/1" };
    api.get.mockResolvedValueOnce({
      data: { results: [{ files: [file, file] }] },
    });
    api.get.mockResolvedValueOnce({
      data: { results: [{ title: "Plan", url: "https://wiki.test/docs/1/" }] },
    });
    const result = await searchSuite("a & b", apps);
    expect(result.results.map((item) => item.source)).toEqual([
      "Files",
      "Wiki",
    ]);
    expect(api.get).toHaveBeenCalledWith("/ocs/search", {
      params: { term: "a & b" },
      signal: undefined,
    });
  });
  it("retains available results when a source fails", async () => {
    api.get.mockRejectedValueOnce(new Error("unavailable"));
    api.get.mockResolvedValueOnce({
      data: { results: [{ title: "Plan", url: "https://wiki.test/docs/1/" }] },
    });
    const result = await searchSuite("plan", apps);
    expect(result.failures).toEqual(["Files"]);
    expect(result.results).toHaveLength(1);
  });
  it("publishes Wiki while Files is pending and keeps the link after Files fails", async () => {
    let failFiles;
    api.get.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failFiles = reject;
        }),
    );
    api.get.mockResolvedValueOnce({
      data: { results: [{ title: "Plan", url: "https://wiki.test/plan" }] },
    });
    const progress = vi.fn();
    const search = searchSuite("plan", apps, undefined, progress);
    await vi.waitFor(() => expect(progress).toHaveBeenCalledOnce());
    const [partial, pending] = progress.mock.calls[0];
    expect(partial.results[0].source).toBe("Wiki");
    expect([...pending]).toEqual(["Files"]);
    failFiles(new Error("unavailable"));
    expect(await search).toEqual({
      results: partial.results,
      failures: ["Files"],
    });
  });
  it("does not query unconfigured apps", async () => {
    expect(await searchSuite("plan", [])).toEqual({
      results: [],
      failures: [],
    });
    expect(api.get).not.toHaveBeenCalled();
  });
  it("rejects unsafe result URLs", () => {
    expect(safeWebUrl("javascript:alert(1)")).toBeNull();
    expect(safeWebUrl(undefined)).toBeNull();
  });
});
