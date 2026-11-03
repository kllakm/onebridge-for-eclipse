import { requireDB, type AppEnv, type D1 } from "./env";
import { userForAddonToken } from "./auth";
import { CORS, json, safe } from "./http";

export const MANIFEST = {
  id: "app.onedrive-for-eclipse",
  name: "My OneDrive Music",
  version: "0.1.0",
  description: "Your personal OneDrive music library",
  resources: ["search", "stream", "catalog"],
  types: ["track", "album", "artist"],
  contentType: "music",
};

/** Resolves the token in the URL to one user; every handler then scopes queries to that user only. */
export function addonHandler(
  token: string,
  fn: (ctx: { env: AppEnv; db: D1; userId: string }) => Promise<Response>,
) {
  return safe(async () => {
    const { env, db } = await requireDB();
    const owner = await userForAddonToken(db, token);
    if (!owner) return json({ error: "This addon link is invalid or has been revoked" }, 401, CORS);
    const res = await fn({ env, db, userId: owner.user_id });
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    res.headers.set("cache-control", "no-store");
    return res;
  }, CORS);
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });
