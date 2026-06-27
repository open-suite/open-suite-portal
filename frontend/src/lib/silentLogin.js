let authRedirectStarted = false;

export function redirectToLogin(redirectTo) {
  if (authRedirectStarted || typeof window === "undefined") {
    return false;
  }

  authRedirectStarted = true;
  const target =
    redirectTo || `${window.location.pathname}${window.location.search}`;
  const loginUrl = target
    ? `/api/v1/auth/login?redirect_to=${encodeURIComponent(target)}`
    : "/api/v1/auth/login";

  window.location.replace(loginUrl);
  return true;
}

export function attemptSilentLoginOrLogin(err) {
  if (err?.response?.status === 401) {
    redirectToLogin(window.location.pathname + window.location.search);
  }
}
