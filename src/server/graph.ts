// Microsoft identity platform + Graph calls. Tokens are only ever handled here, server-side.
import type { AppEnv, D1 } from "./env";
import { ConfigError } from "./env";
import { decryptString, encryptString } from "./crypto";
import { HttpError } from "./http";
import { itemToTrack, type DriveItem } from "./library";

export const MS_SCOPES = "openid email offline_access User.Read Files.Read";
const GRAPH = "https://graph.microsoft.com/v1.0";

function msConfig(env: AppEnv) {
  if (!env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET)
    throw new ConfigError("Microsoft app credentials (MS_CLIENT_ID / MS_CLIENT_SECRET) are not set");
  if (!env.TOKEN_ENC_KEY) throw new ConfigError("TOKEN_ENC_KEY is not set");
  const tenant = env.MS_TENANT || "common";
  return {
    clientId: env.MS_CLIENT_ID,
    clientSecret: env.MS_CLIENT_SECRET,
    encKey: env.TOKEN_ENC_KEY,
    authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}

export function authorizeUrl(env: AppEnv, redirectUri: string, state: string) {
  const c = msConfig(env);
  const u = new URL(c.authorize);
  u.search = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MS_SCOPES,
    state,
    prompt: "select_account",
  }).toString();
  return u.toString();
}

type TokenResp = { access_token: string; refresh_token?: string; expires_in: number };

async function tokenRequest(env: AppEnv, params: Record<string, string>): Promise<TokenResp> {
  const c = msConfig(env);
  const res = await fetch(c.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, scope: MS_SCOPES, ...params }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
    // Log only the error code, never tokens.
    console.error(`MS token error [${res.status}]: ${body.error ?? "unknown"}`);
    throw new HttpError(502, `Microsoft sign-in failed: ${body.error ?? res.status}`);
  }
  return (await res.json()) as TokenResp;
}

export async function connectWithCode(env: AppEnv, db: D1, userId: string, code: string, redirectUri: string) {
  const c = msConfig(env);
  const t = await tokenRequest(env, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (!t.refresh_token) throw new HttpError(502, "Microsoft did not return a refresh token");
  const me = await graphGet<{ id: string; mail?: string; userPrincipalName?: string }>(t.access_token, `${GRAPH}/me?$select=id,mail,userPrincipalName`);
  await db
    .prepare(
      `INSERT INTO microsoft_connections (user_id, ms_account_id, ms_email, access_token_enc, refresh_token_enc, expires_at, folder_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Music', ?)
       ON CONFLICT(user_id) DO UPDATE SET ms_account_id=excluded.ms_account_id, ms_email=excluded.ms_email,
         access_token_enc=excluded.access_token_enc, refresh_token_enc=excluded.refresh_token_enc, expires_at=excluded.expires_at`,
    )
    .bind(
      userId,
      me.id,
      me.mail ?? me.userPrincipalName ?? "",
      await encryptString(t.access_token, c.encKey),
      await encryptString(t.refresh_token, c.encKey),
      Date.now() + t.expires_in * 1000,
      Date.now(),
    )
    .run();
}

/** Returns a valid access token for this user, refreshing (and rotating the refresh token) when needed. */
export async function accessTokenFor(env: AppEnv, db: D1, userId: string): Promise<string> {
  const c = msConfig(env);
  const row = await db
    .prepare("SELECT access_token_enc, refresh_token_enc, expires_at FROM microsoft_connections WHERE user_id = ?")
    .bind(userId)
    .first<{ access_token_enc: string; refresh_token_enc: string; expires_at: number }>();
  if (!row) throw new HttpError(404, "OneDrive is not connected");
  if (row.expires_at - Date.now() > 120_000) return decryptString(row.access_token_enc, c.encKey);
  const t = await tokenRequest(env, {
    grant_type: "refresh_token",
    refresh_token: await decryptString(row.refresh_token_enc, c.encKey),
  });
  await db
    .prepare("UPDATE microsoft_connections SET access_token_enc=?, refresh_token_enc=?, expires_at=? WHERE user_id=?")
    .bind(
      await encryptString(t.access_token, c.encKey),
      t.refresh_token ? await encryptString(t.refresh_token, c.encKey) : row.refresh_token_enc,
      Date.now() + t.expires_in * 1000,
      userId,
    )
    .run();
  return t.access_token;
}

async function graphGet<T>(accessToken: string, url: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429 || res.status === 503) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? "2"), 5);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      console.error(`Graph error [${res.status}]: ${body.slice(0, 300)}`);
      throw new HttpError(res.status === 404 ? 404 : 502, `OneDrive request failed (${res.status})`);
    }
    return (await res.json()) as T;
  }
  throw new HttpError(503, "OneDrive is rate limiting requests; try again shortly");
}

/** Short-lived, pre-authenticated download URL for one of THIS user's files. */
export async function downloadUrl(env: AppEnv, db: D1, userId: string, itemId: string) {
  const token = await accessTokenFor(env, db, userId);
  const item = await graphGet<{ "@microsoft.graph.downloadUrl"?: string }>(
    token,
    `${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}?$select=id,@microsoft.graph.downloadUrl`,
  );
  const url = item["@microsoft.graph.downloadUrl"];
  if (url) return url;
  // Some items omit the annotation. /content supplies the same pre-authenticated
  // URL in its redirect; never follow it here or download/proxy the audio bytes.
  return contentDownloadUrl(token, itemId);
}

/** Request-local only: resolve/refresh once before concurrent owner-scoped tag reads.
 * Metadata uses /content first because it works even when the annotation is absent.
 */
export async function metadataDownloader(env: AppEnv, db: D1, userId: string) {
  const token = await accessTokenFor(env, db, userId);
  return (itemId: string) => contentDownloadUrl(token, itemId);
}

async function contentDownloadUrl(token: string, itemId: string) {
  const response = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "manual",
  });
  const location = response.headers.get("location");
  if (response.body) await response.body.cancel();
  if (response.status === 302 && location) {
    const target = new URL(location);
    if (target.protocol === "https:" && !target.username && !target.password) return target.href;
  }
  throw new HttpError(response.status === 404 ? 404 : 502, `OneDrive did not provide a download redirect (${response.status})`);
}

const PAGES_PER_STEP = 5; // keeps each request well under Worker subrequest limits

/**
 * One step of a delta scan. Call repeatedly until done === true.
 * Uses the saved nextLink (mid-scan), the saved deltaLink (incremental sync), or starts fresh.
 */
export async function scanStep(env: AppEnv, db: D1, userId: string, opts: { full?: boolean } = {}) {
  const token = await accessTokenFor(env, db, userId);
  const conn = await db.prepare("SELECT folder_path FROM microsoft_connections WHERE user_id=?").bind(userId).first<{ folder_path: string }>();
  let state = await db.prepare("SELECT delta_link, next_link FROM sync_state WHERE user_id=?").bind(userId).first<{ delta_link: string | null; next_link: string | null }>();
  if (opts.full) {
    await db.batch([
      db.prepare("DELETE FROM music_files WHERE user_id=?").bind(userId),
      db.prepare("DELETE FROM sync_state WHERE user_id=?").bind(userId),
    ]);
    state = null;
  }
  const folder = (conn?.folder_path ?? "").replace(/^\/+|\/+$/g, "");
  const select = "$select=id,name,size,file,audio,parentReference,lastModifiedDateTime,deleted,folder";
  let url =
    state?.next_link ??
    state?.delta_link ??
    (folder
      ? `${GRAPH}/me/drive/root:/${folder.split("/").map(encodeURIComponent).join("/")}:/delta?${select}`
      : `${GRAPH}/me/drive/root/delta?${select}`);

  let done = false;
  let changed = 0;
  for (let i = 0; i < PAGES_PER_STEP; i++) {
    const page = await graphGet<{ value: DriveItem[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string }>(token, url);
    const stmts = [];
    for (const item of page.value) {
      if (item.deleted) {
        stmts.push(db.prepare("DELETE FROM music_files WHERE user_id=? AND item_id=?").bind(userId, item.id));
        continue;
      }
      const t = itemToTrack(item);
      if (!t) continue;
      stmts.push(
        db
          .prepare(
            `INSERT OR REPLACE INTO music_files (user_id, item_id, name, path, size, ext, mime, title, artist, album, album_artist,
             artist_key, album_key, track_no, disc_no, genre, year, duration, modified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(userId, t.item_id, t.name, t.path, t.size, t.ext, t.mime, t.title, t.artist, t.album, t.album_artist,
            t.artist_key, t.album_key, t.track_no, t.disc_no, t.genre, t.year, t.duration, t.modified_at),
      );
    }
    if (stmts.length) await db.batch(stmts);
    changed += stmts.length;
    if (page["@odata.nextLink"]) {
      url = page["@odata.nextLink"];
      await saveState(db, userId, { next_link: url, status: "scanning" });
    } else {
      await saveState(db, userId, { next_link: null, delta_link: page["@odata.deltaLink"] ?? null, status: "idle", last_sync_at: Date.now(), last_error: null });
      done = true;
      break;
    }
  }
  const count = await db.prepare("SELECT COUNT(*) AS n FROM music_files WHERE user_id=?").bind(userId).first<{ n: number }>();
  await db.prepare("UPDATE sync_state SET track_count=? WHERE user_id=?").bind(count?.n ?? 0, userId).run();
  return { done, changed, trackCount: count?.n ?? 0 };
}

async function saveState(db: D1, userId: string, s: Record<string, unknown>) {
  await db.prepare("INSERT OR IGNORE INTO sync_state (user_id, status) VALUES (?, 'idle')").bind(userId).run();
  const keys = Object.keys(s);
  await db
    .prepare(`UPDATE sync_state SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE user_id=?`)
    .bind(...keys.map((k) => s[k]), userId)
    .run();
}

export async function recordScanError(db: D1, userId: string, message: string) {
  await saveState(db, userId, { status: "error", last_error: message.slice(0, 300) });
}
