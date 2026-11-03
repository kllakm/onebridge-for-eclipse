import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireDB } from "@/server/env";
import { verifyPassword } from "@/server/crypto";
import { createSession, audit } from "@/server/auth";
import { json, safe } from "@/server/http";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(255), password: z.string().min(1).max(200) });

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: ({ request }) =>
        safe(async () => {
          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return json({ error: "Enter your email and password" }, 400);
          const { db } = await requireDB();
          const u = await db
            .prepare("SELECT id, password_hash, disabled FROM users WHERE email=?")
            .bind(parsed.data.email)
            .first<{ id: string; password_hash: string; disabled: number }>();
          if (!u || u.disabled || !(await verifyPassword(parsed.data.password, u.password_hash)))
            return json({ error: "Email or password is incorrect" }, 401);
          await audit(db, u.id, "login");
          return json({ ok: true }, 200, { "set-cookie": await createSession(db, u.id) });
        }),
    },
  },
});
