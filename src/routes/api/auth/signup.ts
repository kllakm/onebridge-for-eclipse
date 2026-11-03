import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireDB } from "@/server/env";
import { hashPassword } from "@/server/crypto";
import { createSession, audit } from "@/server/auth";
import { json, safe } from "@/server/http";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(255), password: z.string().min(10).max(200) });

export const Route = createFileRoute("/api/auth/signup")({
  server: {
    handlers: {
      POST: ({ request }) =>
        safe(async () => {
          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return json({ error: "Enter a valid email and a password of at least 10 characters" }, 400);
          const { db } = await requireDB();
          const exists = await db.prepare("SELECT 1 FROM users WHERE email=?").bind(parsed.data.email).first();
          if (exists) return json({ error: "An account with this email already exists" }, 409);
          const id = crypto.randomUUID();
          await db
            .prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
            .bind(id, parsed.data.email, await hashPassword(parsed.data.password), Date.now())
            .run();
          await audit(db, id, "signup");
          return json({ ok: true }, 200, { "set-cookie": await createSession(db, id) });
        }),
    },
  },
});
