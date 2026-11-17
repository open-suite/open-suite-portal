import { describe, expect, it, vi } from "vitest";
import { signInUrls, warmAppSessions } from "./appSessions";

const APPLICATIONS = [
  { id: "docs", url: "https://docs.suite.test" },
  { id: "meet", url: "https://meet.suite.test" },
  { id: "messages", url: "https://messages.suite.test" },
  { id: "ocs", url: "https://nextcloud.suite.test" },
  { id: "calendar", url: "https://nextcloud.suite.test/apps/calendar" },
  { id: "task", url: "https://nextcloud.suite.test" },
  { id: "grist", url: "https://grist.suite.test" },
  { id: "matrix", url: "https://element.suite.test" },
];

function cookieJar(initial = "") {
  const jar = {
    value: initial,
    written: [],
    read: () => jar.value,
    write: (cookie) => {
      jar.written.push(cookie);
      const pair = cookie.split(";")[0];
      jar.value = jar.value ? `${jar.value}; ${pair}` : pair;
    },
  };
  return jar;
}

describe("background application sign-in", () => {
  it("targets each cookie-session application once, on its own origin", () => {
    expect(signInUrls(APPLICATIONS, "bridge.suite.test")).toEqual([
      "https://docs.suite.test/api/v1.0/authenticate/?silent=true",
      "https://meet.suite.test/api/v1.0/authenticate/?silent=true",
      "https://messages.suite.test/api/v1.0/authenticate/?silent=true",
      "https://nextcloud.suite.test/login",
      "https://grist.suite.test/",
    ]);
  });

  it("never sends credentials outside the suite's own site", () => {
    const applications = [
      { id: "docs", url: "https://docs.elsewhere.test" },
      { id: "meet", url: "http://meet.suite.test" },
      { id: "grist", url: "not a url" },
      { id: "ocs" },
    ];

    expect(signInUrls(applications, "bridge.suite.test")).toEqual([]);
  });

  it("signs in with credentials and an opaque, uncached response", () => {
    const fetchImpl = vi.fn(() => Promise.resolve());

    const urls = warmAppSessions(APPLICATIONS, {
      cookies: cookieJar(),
      fetchImpl,
      hostname: "bridge.suite.test",
    });

    expect(urls).toHaveLength(5);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    for (const [url, options] of fetchImpl.mock.calls) {
      expect(urls).toContain(url);
      expect(options).toEqual({
        cache: "no-store",
        credentials: "include",
        keepalive: true,
        mode: "no-cors",
      });
    }
  });

  it("runs once until its day-long host cookie is gone", () => {
    const fetchImpl = vi.fn(() => Promise.resolve());
    const cookies = cookieJar("theme=dark");
    const options = { cookies, fetchImpl, hostname: "bridge.suite.test" };

    warmAppSessions(APPLICATIONS, options);
    warmAppSessions(APPLICATIONS, options);

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(cookies.written).toEqual([
      "opensuite_app_sessions_warmed=1; Max-Age=86400; Path=/; Secure; SameSite=Lax",
    ]);

    // The auth gate drops this host's cookies when a new suite login starts.
    cookies.value = "theme=dark";
    warmAppSessions(APPLICATIONS, options);
    expect(fetchImpl).toHaveBeenCalledTimes(10);
  });

  it("leaves a failed round trip to the application's own sign-in", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError("offline")));

    expect(() =>
      warmAppSessions(APPLICATIONS, {
        cookies: cookieJar(),
        fetchImpl,
        hostname: "bridge.suite.test",
      }),
    ).not.toThrow();
    await Promise.resolve();
  });

  it("does nothing without a cookie-session application to sign in to", () => {
    const fetchImpl = vi.fn(() => Promise.resolve());
    const cookies = cookieJar();

    expect(
      warmAppSessions([{ id: "matrix", url: "https://element.suite.test" }], {
        cookies,
        fetchImpl,
        hostname: "bridge.suite.test",
      }),
    ).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cookies.written).toEqual([]);
  });
});
