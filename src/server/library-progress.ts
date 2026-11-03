import type { D1 } from "./env";

/** A single owner-key lookup; counters change atomically with track writes. */
export async function libraryProgress(db: D1, userId: string) {
  const row = await db.prepare("SELECT total,tagged,unavailable FROM library_progress WHERE user_id=?")
    .bind(userId).first<{ total: number; tagged: number; unavailable: number }>();
  const total = row?.total ?? 0;
  const tagged = row?.tagged ?? 0;
  const unavailable = row?.unavailable ?? 0;
  const processed = tagged + unavailable;
  return { total, tagged, unavailable, processed, done: total === processed };
}