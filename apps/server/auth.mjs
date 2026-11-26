import { timingSafeEqual } from "node:crypto";
import { hash, token } from "./storage.mjs";
import { HttpError } from "./media.mjs";

export const isLoopback = (host) =>
  ["localhost", "127.0.0.1", "::1", "[::1]", "::ffff:127.0.0.1"].includes(
    host?.toLowerCase(),
  );
const COOKIE = "danceform_session";
export const sameSecret = (a, b) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));

export function requestAuthority(req) {
  const authority = req.headers.host;
  if (
    typeof authority !== "string" ||
    !authority ||
    /[\s/@\\?#]/.test(authority)
  )
    throw new HttpError(400, "Invalid Host header.");
  let parsed;
  try {
    parsed = new URL(`http://${authority}`);
  } catch {
    throw new HttpError(400, "Invalid Host header.");
  }
  if (
    !parsed.hostname ||
    parsed.pathname !== "/" ||
    parsed.username ||
    parsed.password
  )
    throw new HttpError(400, "Invalid Host header.");
  return parsed;
}

export function checkWriteOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new HttpError(403, "Cross-site mutation rejected.");
  if (!req.headers.origin) {
    if (
      req.headers.cookie &&
      !req.headers.authorization &&
      !["GET", "HEAD"].includes(req.method) &&
      !(req.method === "POST" && req.url === "/api/session")
    )
      throw new HttpError(
        403,
        "Cookie-authenticated mutations require an Origin header. Native clients must send a bearer token.",
      );
    return;
  }
  let origin;
  try {
    origin = new URL(req.headers.origin);
  } catch {
    throw new HttpError(403, "Invalid request origin.");
  }
  if (!["http:", "https:"].includes(origin.protocol))
    throw new HttpError(403, "Invalid request origin.");
  const host = requestAuthority(req).hostname;
  const appOrigin = process.env.APP_ORIGIN;
  if (
    origin.host === req.headers.host ||
    origin.origin === appOrigin ||
    (isLoopback(host) && isLoopback(origin.hostname) && origin.port === "5173")
  )
    return;
  throw new HttpError(403, "Cross-site mutation rejected.");
}

export function readSession(req, db) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || "").split(";").map((s) => s.trim().split("=")),
  );
  const bearer = req.headers.authorization;
  const raw = bearer
    ? /^Bearer ([A-Za-z0-9_-]+)$/.exec(bearer)?.[1]
    : cookies[COOKIE];
  if (!raw) return null;
  if (bearer) {
    const share = db
      .prepare(
        "SELECT * FROM shares WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?",
      )
      .get(hash(raw), new Date().toISOString());
    if (share)
      return {
        role: "viewer",
        share_id: share.id,
        actor_id: `share:${share.id}`,
        display_name: share.label,
        routine_id: share.routine_id,
      };
  }
  const session = db
    .prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .get(hash(raw), new Date().toISOString());
  if (!session) return null;
  if (session.share_id) {
    const share = db
      .prepare(
        "SELECT * FROM shares WHERE id = ? AND revoked_at IS NULL AND expires_at > ?",
      )
      .get(session.share_id, new Date().toISOString());
    if (!share) return null;
    session.routine_id = share.routine_id;
  }
  return session;
}

export function setSession(
  res,
  db,
  { role, shareId = null, actorId, displayName },
) {
  const secret = token();
  const ttl = 7 * 24 * 60 * 60;
  const expires = new Date(Date.now() + ttl * 1000).toISOString();
  db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)").run(
    hash(secret),
    role,
    shareId,
    actorId,
    displayName,
    expires,
  );
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl}`,
  );
  return {
    role,
    displayName,
    actorId,
    routineId: null,
    expiresAt: expires,
    accessToken: secret,
  };
}

export function clearSession(req, res, db) {
  const match = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(
    req.headers.cookie || "",
  );
  if (match)
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(match[1]));
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
  );
}

export function requireEditor(session) {
  if (!session) throw new HttpError(401, "Editor sign-in required.");
  if (session.role !== "editor")
    throw new HttpError(403, "Editor access required.");
}

export function requireReader(session, routineId) {
  if (!session)
    throw new HttpError(
      401,
      "A valid rehearsal link or editor session is required.",
    );
  if (session.role !== "editor" && session.routine_id !== routineId)
    throw new HttpError(
      403,
      "This link does not grant access to this routine.",
    );
}
