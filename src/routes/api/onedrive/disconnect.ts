import { createFileRoute } from "@tanstack/react-router";
import { requireDB } from "@/server/env";
import { requireUser, audit } from "@/server/auth";
import { json, safe } from "@/server/http";

// Deletes stored Microsoft tokens, the indexed library and the addon token, so the addon stops working.
export const Route = createFileRoute("/api/onedrive/disconnect")({
  server: {
    handlers: {
      POST: ({ request }) =>
        safe(async () => {
          const { db } = await requireDB();
          const user = await requireUser(db, request);
          await db.batch([
            db.prepare("DELETE FROM microsoft_connections WHERE user_id=?").bind(user.id),
            db.prepare("DELETE FROM music_files WHERE user_id=?").bind(user.id),
            db.prepare("DELETE FROM sync_state WHERE user_id=?").bind(user.id),
            db.prepare("DELETE FROM addon_tokens WHERE user_id=?").bind(user.id),
          ]);
          await audit(db, user.id, "onedrive_disconnected");
          return json({ ok: true });
        }),
    },
  },
});
