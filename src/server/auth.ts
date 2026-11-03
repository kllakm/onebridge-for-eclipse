import type { D1 } from "./env";
import { randomToken, sha256Hex } from "./crypto";
import { cookie, HttpError, setCookie } from "./http";

export const SESSION_COOKIE = "em_session";
const SESSION_DAYS = 30;

export async function createSession(db: D1, userId: string): Promise<string> {
  const token = randomToken(32);
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), userId, expires)
    .run();
  return setCookie(SESSION_COOKIE, token, SESSION_DAYS * 86400);
}

export async function getSessionUser(db: D1, req: Request) {
  const token = cookie(req, SESSION_COOKIE);
  if (!token) return null;
  return db
    .prepare(
      `SELECT u.id, u.email, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
    )
    .bind(await sha256Hex(token), Date.now())
    .first<{ id: string; email: string; is_admin: number }>();
}

export async function requireUser(db: D1, req: Request) {
  const u = await getSessionUser(db, req);
  if (!u) throw new HttpError(401, "Not signed in");
  return u;
}

export async function destroySession(db: D1, req: Request) {
  const token = cookie(req, SESSION_COOKIE);
  if (token)
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  return setCookie(SESSION_COOKIE, "", 0);
}

export async function audit(db: D1, userId: string | null, action: string, detail = "") {
  await db
    .prepare("INSERT INTO audit_logs (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)")
    .bind(userId, action, detail.slice(0, 500), Date.now())
    .run();
}

/** Resolve an addon URL token to exactly one active user (or null). */
export async function userForAddonToken(db: D1, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return db
    .prepare(
      `SELECT t.user_id FROM addon_tokens t JOIN users u ON u.id = t.user_id
       JOIN microsoft_connections m ON m.user_id = t.user_id
       WHERE t.token_hash = ? AND u.disabled = 0`,
    )
    .bind(await sha256Hex(token))
    .first<{ user_id: string }>();
}
