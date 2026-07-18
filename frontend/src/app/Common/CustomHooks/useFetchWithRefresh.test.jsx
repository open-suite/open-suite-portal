import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/axios";
import { attemptSilentLoginOrLogin } from "@/lib/silentLogin";
import { useAutoRefresh } from "./useAutoRefresh";
import { useFetchWithRefresh } from "./useFetchWithRefresh";

vi.mock("@/lib/axios", () => ({
  default: { get: vi.fn() },
}));

vi.mock("@/lib/silentLogin", () => ({
  attemptSilentLoginOrLogin: vi.fn(),
}));

vi.mock("./useAutoRefresh", () => ({
  useAutoRefresh: vi.fn(),
}));

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useFetchWithRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports loading, data, and errors across request transitions", async () => {
    api.get.mockResolvedValueOnce({ data: { results: [] } });
    const { result } = renderHook(() => useFetchWithRefresh("/documents"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ results: [] });
    expect(result.current.error).toBe("");

    const error = Object.assign(new Error("Offline"), {
      response: { status: 503 },
    });
    api.get.mockRejectedValueOnce(error);

    await act(async () => {
      await result.current.onRefresh();
    });

    expect(result.current.error).toBe("Offline");
    expect(attemptSilentLoginOrLogin).toHaveBeenCalledWith(error);
  });

  it("does not let an older request overwrite a newer refresh", async () => {
    const first = deferred();
    const second = deferred();
    api.get
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useFetchWithRefresh("/documents"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.onRefresh();
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

    await act(async () => {
      second.resolve({ data: { request: "new" } });
      await second.promise;
    });
    expect(result.current.data).toEqual({ request: "new" });

    await act(async () => {
      first.resolve({ data: { request: "old" } });
      await first.promise;
    });
    expect(result.current.data).toEqual({ request: "new" });
  });

  it("finishes interactive loading when an auto-refresh overlaps it", async () => {
    const interactive = deferred();
    const automatic = deferred();
    api.get
      .mockReturnValueOnce(interactive.promise)
      .mockReturnValueOnce(automatic.promise);

    const { result } = renderHook(() => useFetchWithRefresh("/documents"));
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => {
      useAutoRefresh.mock.lastCall[0]();
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

    await act(async () => {
      automatic.resolve({ data: { request: "automatic" } });
      await automatic.promise;
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      interactive.resolve({ data: { request: "interactive" } });
      await interactive.promise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ request: "automatic" });
  });
});
