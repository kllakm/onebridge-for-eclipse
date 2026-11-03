import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "@/server/env";
import { getSessionUser } from "@/server/auth";
import { json, safe } from "@/server/http";

export const Route = createFileRoute("/api/me")({
  server: {
    handlers: {
      GET: ({ request }) =>
        safe(async () => {
          const env = await getEnv();
          const configured = {
            database: !!env.DB,
            microsoft: !!(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET),
            encryption: !!env.TOKEN_ENC_KEY,
          };
          if (!env.DB) return json({ user: null, configured });
          const db = env.DB;
          const user = await getSessionUser(db, request);
          if (!user) return json({ user: null, configured });
          const conn = await db
            .prepare("SELECT ms_email, folder_path FROM microsoft_connections WHERE user_id=?")
            .bind(user.id)
            .first<{ ms_email: string; folder_path: string }>();
          const sync = await db
            .prepare("SELECT status, last_sync_at, last_error, track_count FROM sync_state WHERE user_id=?")
            .bind(user.id)
            .first();
          const counts = await db
            .prepare("SELECT COUNT(DISTINCT artist_key) AS artists, COUNT(DISTINCT album_key) AS albums FROM music_files WHERE user_id=?")
            .bind(user.id)
            .first<{ artists: number; albums: number }>();
          const token = await db.prepare("SELECT created_at FROM addon_tokens WHERE user_id=?").bind(user.id).first<{ created_at: number }>();
          return json({
            user: { email: user.email },
            configured,
            connection: conn ? { email: conn.ms_email, folder: conn.folder_path } : null,
            sync,
            counts,
            addonTokenCreatedAt: token?.created_at ?? null,
          });
        }),
    },
  },
});
