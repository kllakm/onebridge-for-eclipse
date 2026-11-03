import { createFileRoute } from "@tanstack/react-router";
import { requireDB } from "@/server/env";
import { requireUser, audit } from "@/server/auth";
import { connectWithCode } from "@/server/graph";
import { appOrigin, HttpError } from "@/server/http";
import { microsoftErrorCode } from "@/server/microsoft-error";

export const Route = createFileRoute("/api/onedrive/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (msg: string, diagnostic?: string) => {
          const params = new URLSearchParams({ onedrive: msg });
          if (diagnostic) params.set("microsoft_error", diagnostic);
          return new Response(null, { status: 302, headers: { location: `/dashboard?${params}` } });
        };
        try {
          const { env, db } = await requireDB();
          const user = await requireUser(db, request);
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          if (!state) return back("invalid");
          const row = await db
            .prepare("DELETE FROM oauth_states WHERE state=? AND user_id=? AND created_at > ? RETURNING state")
            .bind(state, user.id, Date.now() - 600_000)
            .first();
          if (!row) return back("expired");
          if (url.searchParams.get("error")) return back("provider_error", microsoftErrorCode(url.searchParams));
          if (!code) return back("invalid");
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
