import { createFileRoute } from "@tanstack/react-router";
import { requireDB } from "@/server/env";
import { requireUser, audit } from "@/server/auth";
import { randomToken, sha256Hex } from "@/server/crypto";
import { appOrigin, json, safe } from "@/server/http";

// POST: create or replace the user's addon URL (old one stops working). DELETE: revoke.
export const Route = createFileRoute("/api/addon-token")({
  server: {
    handlers: {
      POST: ({ request }) =>
        safe(async () => {
          const { env, db } = await requireDB();
          const user = await requireUser(db, request);
          const conn = await db.prepare("SELECT 1 FROM microsoft_connections WHERE user_id=?").bind(user.id).first();
          if (!conn) return json({ error: "Connect OneDrive first" }, 400);
          const token = randomToken(32);
          await db.batch([
            db.prepare("DELETE FROM addon_tokens WHERE user_id=?").bind(user.id),
            db.prepare("INSERT INTO addon_tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)").bind(await sha256Hex(token), user.id, Date.now()),
          ]);
          await audit(db, user.id, "addon_token_generated");
          // Shown once; only the hash is stored.
          return json({ url: `${appOrigin(request, env.APP_URL)}/addon/${token}/manifest.json` });
        }),
      DELETE: ({ request }) =>
        safe(async () => {
          const { db } = await requireDB();
          const user = await requireUser(db, request);
          await db.prepare("DELETE FROM addon_tokens WHERE user_id=?").bind(user.id).run();
          await audit(db, user.id, "addon_token_revoked");
          return json({ ok: true });
        }),
    },
  },
});
