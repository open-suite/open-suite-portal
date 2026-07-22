const AUTH_REDIRECT_KEY = "portal_native_oidc_redirect";
export const AUTH_ERROR_PARAM = "native_oidc_error";

export function currentPortalLocation() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function buildLoginUrl(redirectTo, { silent = true } = {}) {
  const params = new URLSearchParams({ redirect_to: redirectTo });
  if (silent) params.set("silent", "true");
  return `/api/v1/auth/login?${params.toString()}`;
}

export function redirectToLogin(
  redirectTo = currentPortalLocation(),
  navigate = (url) => window.location.replace(url),
) {
  if (typeof window === "undefined") {
    return false;
  }

  // This survives the OIDC round trip and strictly bounds automatic login to
  // one attempt per tab. A successful Portal bootstrap clears it below.
  try {
    if (window.sessionStorage.getItem(AUTH_REDIRECT_KEY)) return false;
    window.sessionStorage.setItem(AUTH_REDIRECT_KEY, redirectTo);
  } catch {
    // Fail closed to the actionable error instead of risking a redirect loop.
    return false;
  }
  navigate(buildLoginUrl(redirectTo));
  return true;
}

export function attemptSilentLoginOrLogin(err) {
  if (err?.response?.status === 401) {
    return redirectToLogin();
  }
  return false;
}

export function clearLoginAttempt() {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    } catch {
      // A successful bootstrap needs no action if storage is unavailable.
    }
  }
}

export function hasNativeOidcError() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(AUTH_ERROR_PARAM);
}

export function nativeLoginRetryUrl() {
  if (typeof window === "undefined") return "/api/v1/auth/login";

  const query = window.location.search
    .slice(1)
    .split("&")
    .filter((component) => {
      try {
        return (
          decodeURIComponent(
            component.split("=", 1)[0].replaceAll("+", " "),
          ) !== AUTH_ERROR_PARAM
        );
      } catch {
        return true;
      }
    })
    .join("&");
  const target = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  return buildLoginUrl(target, { silent: false });
}
