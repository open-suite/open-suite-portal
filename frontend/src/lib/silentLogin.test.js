import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLoginUrl,
  clearLoginAttempt,
  currentPortalLocation,
  nativeLoginRetryUrl,
  redirectToLogin,
} from "./silentLogin";

describe("native Portal OIDC handoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("preserves the exact requested path, query, and hash in silent login", () => {
    window.history.replaceState(
      {},
      "",
      "/docs/report?view=full&sort=asc#section-2",
    );

    const target = currentPortalLocation();
    const login = new URL(buildLoginUrl(target), window.location.origin);

    expect(target).toBe("/docs/report?view=full&sort=asc#section-2");
    expect(login.pathname).toBe("/api/v1/auth/login");
    expect(login.searchParams.get("redirect_to")).toBe(target);
    expect(login.searchParams.get("silent")).toBe("true");
  });

  it("allows only one automatic OIDC attempt until bootstrap succeeds", () => {
    const navigate = vi.fn();

    expect(redirectToLogin("/calendar", navigate)).toBe(true);
    expect(redirectToLogin("/calendar", navigate)).toBe(false);
    expect(navigate).toHaveBeenCalledOnce();

    clearLoginAttempt();
    expect(redirectToLogin("/calendar", navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it("builds an explicit retry without carrying the failure marker", () => {
    window.history.replaceState(
      {},
      "",
      "/calendar?q=a%20b&flag&item=1&item=2&native_oidc_error=authentication_failed#agenda",
    );

    const retry = new URL(nativeLoginRetryUrl(), window.location.origin);

    expect(retry.searchParams.has("silent")).toBe(false);
    expect(retry.searchParams.get("redirect_to")).toBe(
      "/calendar?q=a%20b&flag&item=1&item=2#agenda",
    );
  });
});
