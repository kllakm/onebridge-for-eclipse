import { createFileRoute } from "@tanstack/react-router";
import { requireDB } from "@/server/env";
import { requireUser } from "@/server/auth";
import { randomToken } from "@/server/crypto";
import { authorizeUrl } from "@/server/graph";
import { appOrigin, safe } from "@/server/http";

// Browser navigates here; we redirect to Microsoft's official sign-in page.
export const Route = createFileRoute("/api/onedrive/connect")({
  server: {
    handlers: {
      GET: ({ request }) =>
        safe(async () => {
          const { env, db } = await requireDB();
          const user = await requireUser(db, request);
          const state = randomToken(24);
          await db.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(Date.now() - 600_000).run();
          await db.prepare("INSERT INTO oauth_states (state, user_id, created_at) VALUES (?, ?, ?)").bind(state, user.id, Date.now()).run();
          const redirectUri = `${appOrigin(request, env.APP_URL)}/api/onedrive/callback`;
          return new Response(null, { status: 302, headers: { location: authorizeUrl(env, redirectUri, state) } });
        }),
    },
  },
});
