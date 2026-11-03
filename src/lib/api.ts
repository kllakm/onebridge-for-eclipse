// Small browser-side fetch helper for the app's own /api routes (cookie session).
export async function api<T = unknown>(path: string, init?: RequestInit & { body?: string }): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : {},
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export type MeResponse = {
  user: { email: string } | null;
  configured: { database: boolean; microsoft: boolean; encryption: boolean };
  connection?: { email: string; folder: string } | null;
  sync?: { status: string; last_sync_at: number | null; last_error: string | null; track_count: number } | null;
  counts?: { artists: number; albums: number } | null;
  addonTokenCreatedAt?: number | null;
};
