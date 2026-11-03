import { createFileRoute } from "@tanstack/react-router";
import { addonHandler, preflight } from "@/server/addon";
import { downloadUrl } from "@/server/graph";
import { json } from "@/server/http";
import { ITEM_ID_RE, streamHints } from "@/server/library";

// Returns a fresh, short-lived OneDrive download URL. Audio bytes never pass through this server.
export const Route = createFileRoute("/addon/$token/stream/$id")({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: ({ params }) =>
        addonHandler(params.token, async ({ env, db, userId }) => {
          if (!ITEM_ID_RE.test(params.id)) return json({ error: "Invalid track id" }, 400);
          // Ownership check: the item must be in THIS user's index.
          const row = await db
            .prepare("SELECT ext FROM music_files WHERE user_id=? AND item_id=?")
            .bind(userId, params.id)
            .first<{ ext: string }>();
          if (!row) return json({ error: "Track not found" }, 404);
          const url = await downloadUrl(env, db, userId, params.id);
          return json({
            url,
            format: row.ext,
            ...streamHints(row.ext),
            encrypted: false,
            // Microsoft documents these URLs as short-lived; we advertise a conservative window.
            expiresAt: Math.floor(Date.now() / 1000) + 10 * 60,
          });
        }),
    },
  },
});
