// Sign the browser in to each application ahead of the first click.
//
// Every application keeps its own session next to the suite login. Without
// one, the first visit loads the application, finds no session, makes a
// sign-in round trip through the identity provider and loads again. All
// suite hosts share one site, so a credentialed request from the portal
// completes that round trip in the background: the redirects run and the
// application's session cookie is stored, while the response stays opaque.

// A cookie, not localStorage: the auth gate drops this host's cookies when a
// new suite login starts, which is exactly when the application sessions it
// records are dropped too.
const WARMED_COOKIE = "opensuite_app_sessions_warmed";
// Application sessions outlive a day; repeating daily also repairs a session
// an application lost on its own.
const WARM_INTERVAL_SECONDS = 24 * 60 * 60;

// Per application id: a path that answers with the application's own sign-in
// redirect when the browser has no session there. Chat is absent because
// Element keeps its session in browser storage, not in a cookie.
const SIGN_IN_ENTRY = {
  docs: "/api/v1.0/authenticate/?silent=true",
  meet: "/api/v1.0/authenticate/?silent=true",
  messages: "/api/v1.0/authenticate/?silent=true",
  ocs: "/login",
  grist: "/",
};

const documentCookies = {
  read: () => document.cookie,
  write: (cookie) => {
    document.cookie = cookie;
  },
};

function suiteDomain(hostname) {
  return hostname.replace(/^[^.]+\./, "");
}

// Only sibling hosts of the portal: a credentialed request to any other
// configured URL would not be same-site and has no session to establish.
export function signInUrls(applications, portalHostname) {
  const domain = suiteDomain(portalHostname);
  const urls = [];
  for (const application of applications || []) {
    const entry = SIGN_IN_ENTRY[application?.id];
    if (!entry || !application.url) continue;
    let origin;
    try {
      origin = new URL(application.url);
    } catch {
      continue;
    }
    if (origin.protocol !== "https:") continue;
    if (suiteDomain(origin.hostname) !== domain) continue;
    const url = new URL(entry, origin.origin).toString();
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

export function warmAppSessions(
  applications,
  {
    cookies = documentCookies,
    fetchImpl = globalThis.fetch,
    hostname = globalThis.location?.hostname ?? "",
  } = {},
) {
  const urls = signInUrls(applications, hostname);
  if (!urls.length || typeof fetchImpl !== "function") return [];
  const warmed = cookies
    .read()
    .split(";")
    .some((pair) => pair.trim().startsWith(`${WARMED_COOKIE}=`));
  if (warmed) return [];
  cookies.write(
    `${WARMED_COOKIE}=1; Max-Age=${WARM_INTERVAL_SECONDS}; Path=/; Secure; SameSite=Lax`,
  );
  for (const url of urls) {
    // keepalive lets a round trip finish when the person leaves the portal
    // while it is in flight. A failure only means the application signs the
    // browser in itself on the first visit, as it did before.
    fetchImpl(url, {
      cache: "no-store",
      credentials: "include",
      keepalive: true,
      mode: "no-cors",
    }).catch(() => {});
  }
  return urls;
}
