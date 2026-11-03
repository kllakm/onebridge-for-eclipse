// Cloudflare bindings + secrets. Resolved at request time; never imported by browser code.
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1 {
  prepare(query: string): D1Stmt;
  batch(statements: D1Stmt[]): Promise<unknown>;
}

export type AppEnv = {
  DB?: D1;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  MS_TENANT?: string;
  TOKEN_ENC_KEY?: string;
  APP_URL?: string;
};

let requestEnv: Record<string, unknown> | null = null;

/** Called from src/server.ts with the Worker's env object, when provided. */
export function setRequestEnv(env: unknown) {
  if (env && typeof env === "object") requestEnv = env as Record<string, unknown>;
}

export async function getEnv(): Promise<AppEnv> {
  let cf: Record<string, unknown> = {};
  try {
    const spec = "cloudflare:workers";
    const mod = (await import(/* @vite-ignore */ spec)) as { env?: Record<string, unknown> };
    cf = mod.env ?? {};
  } catch {
    // not running on workerd (e.g. local vite dev)
  }
  const proc =
    typeof process !== "undefined" && process.env ? (process.env as Record<string, unknown>) : {};
  return { ...proc, ...(requestEnv ?? {}), ...cf } as AppEnv;
}

export class ConfigError extends Error {}

export async function requireDB(): Promise<{ env: AppEnv; db: D1 }> {
  const env = await getEnv();
  if (!env.DB) throw new ConfigError("D1 database binding 'DB' is not configured");
  return { env, db: env.DB };
}
