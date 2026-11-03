import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireDB } from "@/server/env";
import { requireUser } from "@/server/auth";
import { recordScanError, scanStep } from "@/server/graph";
import { HttpError, json, safe } from "@/server/http";

const Body = z.object({ full: z.boolean().optional(), folder: z.string().max(400).optional() });

// One scan step per call; the dashboard keeps calling until done === true.
export const Route = createFileRoute("/api/onedrive/scan")({
  server: {
    handlers: {
      POST: ({ request }) =>
        safe(async () => {
          const { env, db } = await requireDB();
          const user = await requireUser(db, request);
          const body = Body.safeParse(await request.json().catch(() => ({})));
          if (!body.success) return json({ error: "Invalid request" }, 400);
          let full = body.data.full ?? false;
          if (body.data.folder !== undefined) {
            const folder = body.data.folder.trim().replace(/^\/+|\/+$/g, "");
            if (/\.\.|[<>:"|?*\\]/.test(folder)) return json({ error: "Invalid folder name" }, 400);
            await db.prepare("UPDATE microsoft_connections SET folder_path=? WHERE user_id=?").bind(folder, user.id).run();
            full = true;
          }
          try {
            return json(await scanStep(env, db, user.id, { full }));
          } catch (e) {
            await recordScanError(db, user.id, e instanceof HttpError ? e.message : "Scan failed");
            throw e;
          }
        }),
    },
  },
});
