import { ConfigError } from "./env";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function cookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSec: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

/** Wrap a handler so config/unexpected errors become JSON without leaking secrets. */
export async function safe(fn: () => Promise<Response>, extraHeaders: Record<string, string> = {}) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ConfigError) return json({ error: e.message }, 503, extraHeaders);
    if (e instanceof HttpError) return json({ error: e.message }, e.status, extraHeaders);
    console.error("handler error:", e instanceof Error ? e.message : "unknown");
    return json({ error: "Internal error" }, 500, extraHeaders);
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function appOrigin(req: Request, appUrl?: string) {
  return (appUrl || new URL(req.url).origin).replace(/\/$/, "");
}
