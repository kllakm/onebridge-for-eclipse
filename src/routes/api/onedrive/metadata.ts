import { createFileRoute } from "@tanstack/react-router";
import { requireDB } from "@/server/env";
import { requireUser } from "@/server/auth";
import { metadataStep } from "@/server/metadata";
import { json, safe } from "@/server/http";

export const Route = createFileRoute("/api/onedrive/metadata")({
  server: { handlers: {
    POST: ({ request }) => safe(async () => {
      const { env, db } = await requireDB();
      const user = await requireUser(db, request);
      const body: unknown = await request.json().catch(() => ({}));
      const diagnose = typeof body === "object" && body !== null && "diagnose" in body && body.diagnose === true;
      return json(await metadataStep(env, db, user.id, diagnose));
    }),
  } },
});