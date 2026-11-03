import { createFileRoute } from "@tanstack/react-router";
import { requireDB } from "@/server/env";
import { destroySession } from "@/server/auth";
import { json, safe } from "@/server/http";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: ({ request }) =>
        safe(async () => {
          const { db } = await requireDB();
          return json({ ok: true }, 200, { "set-cookie": await destroySession(db, request) });
        }),
    },
  },
});
