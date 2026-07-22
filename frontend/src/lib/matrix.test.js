import { describe, expect, it, vi } from "vitest";
import { runUnreadSync } from "./matrix";

describe("runUnreadSync", () => {
  it("clears the expired session and unread cache on 401", async () => {
    localStorage.setItem(
      "matrix_session",
      JSON.stringify({
        accessToken: "expired-token",
        userId: "@ada:example.test",
      }),
    );
    localStorage.setItem(
      "matrix_unread_cache_v1",
      JSON.stringify({ userId: "@ada:example.test", rooms: [] }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, ok: false }),
    );

    await expect(
      runUnreadSync({
        signal: new AbortController().signal,
        onRooms: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 401 });

    expect(localStorage.getItem("matrix_session")).toBeNull();
    expect(localStorage.getItem("matrix_unread_cache_v1")).toBeNull();
  });
});
