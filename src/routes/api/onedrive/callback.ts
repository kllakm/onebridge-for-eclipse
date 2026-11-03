import { createFileRoute } from "@tanstack/react-router";
import { requireDB } from "@/server/env";
import { requireUser, audit } from "@/server/auth";
import { connectWithCode } from "@/server/graph";
import { appOrigin, HttpError } from "@/server/http";

export const Route = createFileRoute("/api/onedrive/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (msg: string) =>
          new Response(null, { status: 302, headers: { location: `/dashboard?onedrive=${encodeURIComponent(msg)}` } });
        try {
          const { env, db } = await requireDB();
          const user = await requireUser(db, request);
          if (url.searchParams.get("error")) return back("cancelled");
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          if (!code || !state) return back("invalid");
          const row = await db
            .prepare("DELETE FROM oauth_states WHERE state=? AND user_id=? AND created_at > ? RETURNING state")
            .bind(state, user.id, Date.now() - 600_000)
            .first();
          if (!row) return back("expired");
          await connectWithCode(env, db, user.id, code, `${appOrigin(request, env.APP_URL)}/api/onedrive/callback`);
          await audit(db, user.id, "onedrive_connected");
          return back("connected");
        } catch (e) {
          return back(e instanceof HttpError ? "failed" : "error");
        }
      },
    },
  },
});
