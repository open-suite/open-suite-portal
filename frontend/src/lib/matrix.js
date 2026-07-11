// Matrix client-server helpers for the Chat widget: log in via the user's
// existing OIDC session, then follow a standard long-poll /sync loop to show
// unread channels. (No matrix-js-sdk: without crypto it won't surface unread
// counts for encrypted rooms; raw /sync does, and the counts already include
// thread notifications.)
//
// Hosts are derived from the current domain at runtime so the portal is
// deployment-agnostic: the portal runs at bridge.<domain>, and Synapse/Element
// at matrix.<domain> / element.<domain>. (The Keycloak IdP id registered in
// Synapse is a fixed alias, not a hostname.)
const KO_BASE_DOMAIN =
  typeof window !== "undefined"
    ? window.location.hostname.replace(/^[^.]+\./, "") // strip the "bridge." label
    : "";
const KO_PROTO =
  typeof window !== "undefined" ? window.location.protocol : "https:";
export const MATRIX_HOMESERVER = KO_BASE_DOMAIN
  ? `${KO_PROTO}//matrix.${KO_BASE_DOMAIN}`
  : "";
export const MATRIX_ELEMENT = KO_BASE_DOMAIN
  ? `${KO_PROTO}//element.${KO_BASE_DOMAIN}`
  : "";
export const MATRIX_IDP = "oidc-mijnbureau";

const SESSION_KEY = "matrix_session";
const UNREAD_CACHE_KEY = "matrix_unread_cache_v1";

export function getMatrixSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function clearMatrixSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(UNREAD_CACHE_KEY);
}

export function getCachedUnreadRooms(session = getMatrixSession()) {
  if (!session?.userId) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(UNREAD_CACHE_KEY));
    if (cached?.userId !== session.userId || !Array.isArray(cached.rooms)) {
      return null;
    }
    return cached.rooms
      .filter(
        (room) =>
          typeof room?.roomId === "string" &&
          typeof room?.name === "string" &&
          Number.isFinite(room?.unread) &&
          Number.isFinite(room?.highlight),
      )
      .map((room) => ({
        ...room,
        url: `${MATRIX_ELEMENT}/#/room/${room.roomId}`,
      }));
  } catch {
    return null;
  }
}

function cacheUnreadRooms(session, rooms) {
  try {
    localStorage.setItem(
      UNREAD_CACHE_KEY,
      JSON.stringify({
        userId: session.userId,
        rooms: rooms.map(({ roomId, name, unread, highlight }) => ({
          roomId,
          name,
          unread,
          highlight,
        })),
      }),
    );
  } catch {
    // Storage can be unavailable; live sync remains the source of truth.
  }
}

// Full-page redirect into Synapse's SSO flow. Since the user already has a
// Keycloak session this is normally silent, bouncing straight back to
// /matrix-callback with a loginToken.
export function startMatrixLogin() {
  const redirectUrl = `${window.location.origin}/matrix-callback`;
  window.location.href =
    `${MATRIX_HOMESERVER}/_matrix/client/v3/login/sso/redirect/${MATRIX_IDP}` +
    `?redirectUrl=${encodeURIComponent(redirectUrl)}`;
}

// Exchange the one-time loginToken from the SSO redirect for a Matrix token.
export async function exchangeLoginToken(loginToken) {
  const res = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "m.login.token",
      token: loginToken,
      initial_device_display_name: "Open Suite portal",
    }),
  });
  if (!res.ok) throw new Error(`Matrix login failed (${res.status})`);
  const data = await res.json();
  localStorage.removeItem(UNREAD_CACHE_KEY);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: data.access_token,
      userId: data.user_id,
      deviceId: data.device_id,
    }),
  );
  return data;
}

// Sync filter: room name + canonical alias + members (lazy-loaded), no
// timeline. This carries per-room unread_notifications (Synapse folds thread
// notifs into them) plus the state needed to name rooms.
const SYNC_FILTER = JSON.stringify({
  room: {
    timeline: { limit: 0 },
    state: {
      types: ["m.room.name", "m.room.canonical_alias", "m.room.member"],
      lazy_load_members: true,
    },
  },
});

const localpart = (mxid) => mxid.replace(/^@/, "").split(":")[0];

// Matrix room-naming order: explicit name, else canonical alias (#room).
// "" when the room has neither (then we use participants / a cached name).
function authoritativeName(events) {
  const named = events?.find((e) => e.type === "m.room.name")?.content?.name;
  if (named) return named;
  const alias = events?.find((e) => e.type === "m.room.canonical_alias")
    ?.content?.alias;
  return alias ? alias.split(":")[0] : "";
}

// For unnamed rooms (DMs): the other participant(s) by display name.
function participantName(events, summary, selfId) {
  const member = {};
  for (const e of events || []) {
    if (e.type === "m.room.member")
      member[e.state_key] = e.content?.displayname;
  }
  const others = summary?.["m.heroes"]?.length
    ? summary["m.heroes"]
    : Object.keys(member).filter((id) => id !== selfId);
  return others.map((id) => member[id] || localpart(id)).join(", ");
}

// Merge one /sync response into the running room map. Incremental syncs only
// resend a room's name/members when they change, so an absent value means
// "unchanged" — keep what we have.
function applySync(rooms, data, selfId) {
  for (const [id, room] of Object.entries(data.rooms?.join ?? {})) {
    const prev = rooms.get(id);
    const counts = room.unread_notifications;
    rooms.set(id, {
      roomId: id,
      name:
        authoritativeName(room.state?.events) ||
        prev?.name ||
        participantName(room.state?.events, room.summary, selfId),
      unread: counts?.notification_count ?? prev?.unread ?? 0,
      highlight: counts?.highlight_count ?? prev?.highlight ?? 0,
      url: `${MATRIX_ELEMENT}/#/room/${id}`,
    });
  }
  for (const [id, room] of Object.entries(data.rooms?.invite ?? {})) {
    const prev = rooms.get(id);
    rooms.set(id, {
      roomId: id,
      name:
        authoritativeName(room.invite_state?.events) ||
        prev?.name ||
        participantName(room.invite_state?.events, undefined, selfId),
      unread: 1,
      highlight: 1,
      url: `${MATRIX_ELEMENT}/#/room/${id}`,
    });
  }
  for (const id of Object.keys(data.rooms?.leave ?? {})) rooms.delete(id);
}

function unreadList(rooms) {
  return [...rooms.values()]
    .filter((r) => r.unread > 0 || r.highlight > 0)
    .sort((a, b) => b.unread - a.unread);
}

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => clearTimeout(id), { once: true });
  });

// Standard Matrix sync loop: one initial sync to baseline, then long-poll with
// the since cursor so the server pushes changes as they happen. Calls
// onRooms(list) after every sync. Runs until `signal` is aborted. Throws with
// code 401 if the session is no longer valid (caller should prompt reconnect).
export async function runUnreadSync({ signal, onRooms }) {
  const session = getMatrixSession();
  if (!session) return;

  const rooms = new Map();
  let since = null;

  while (!signal.aborted) {
    const params = new URLSearchParams({
      filter: SYNC_FILTER,
      timeout: since ? "30000" : "0",
    });
    if (since) params.set("since", since);

    let res;
    try {
      res = await fetch(
        `${MATRIX_HOMESERVER}/_matrix/client/v3/sync?${params}`,
        { headers: { Authorization: `Bearer ${session.accessToken}` }, signal },
      );
    } catch {
      if (signal.aborted) return;
      await sleep(3000, signal); // network blip — retry the same cursor
      continue;
    }

    if (res.status === 401) {
      clearMatrixSession();
      const err = new Error("Matrix session expired");
      err.code = 401;
      throw err;
    }
    if (!res.ok) {
      await sleep(3000, signal); // transient server error — retry
      continue;
    }

    const data = await res.json();
    since = data.next_batch;
    applySync(rooms, data, session.userId);
    const unread = unreadList(rooms);
    cacheUnreadRooms(session, unread);
    onRooms(unread);
  }
}
