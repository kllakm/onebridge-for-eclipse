import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadUrl } from "./graph";
import { encryptString } from "./crypto";
import type { D1, D1Stmt } from "./env";

afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
  const encrypted = await encryptString("test-access-token", key);
  const bind = vi.fn();
  const stmt: D1Stmt = {
    bind,
    first: vi.fn().mockResolvedValue({ access_token_enc: encrypted, refresh_token_enc: "unused", expires_at: Date.now() + 600_000 }),
    all: vi.fn(), run: vi.fn(),
  };
  bind.mockReturnValue(stmt);
  const db: D1 = { prepare: vi.fn().mockReturnValue(stmt), batch: vi.fn() };
  const env = { MS_CLIENT_ID: "test-id", MS_CLIENT_SECRET: "test-secret", TOKEN_ENC_KEY: key };
  return { db, env, bind };
}

describe("OneDrive download URL", () => {
  it("uses the content redirect when the item omits its download annotation without fetching audio", async () => {
    const { db, env, bind } = await setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "track!1" }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://download.example.test/song.mp3" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await downloadUrl(env, db, "owner-id", "track!1")).toBe("https://download.example.test/song.mp3");
    expect(bind).toHaveBeenCalledWith("owner-id");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://graph.microsoft.com/v1.0/me/drive/items/track!1/content");
    expect(fetchMock.mock.calls[1]?.[1].redirect).toBe("manual");
  });

  it("keeps the annotation fast path", async () => {
    const { db, env } = await setup();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ "@microsoft.graph.downloadUrl": "https://download.example.test/song.flac" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await downloadUrl(env, db, "owner-id", "track!1")).toBe("https://download.example.test/song.flac");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a missing file instead of returning a Graph login URL", async () => {
    const { db, env } = await setup();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "track!1" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 })));
    await expect(downloadUrl(env, db, "owner-id", "track!1")).rejects.toMatchObject({ status: 404 });
  });
});