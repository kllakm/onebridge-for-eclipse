import { afterEach, describe, expect, it, vi } from "vitest";
import { readEmbeddedTags, mergeTags, metadataStep, tagFailure } from "./metadata";
import { RangeTokenizer, TAG_BYTE_LIMIT, TAG_REQUEST_LIMIT, TAG_TIMEOUT_MS } from "./range-tokenizer";
import { itemToTrack } from "./library";
import type { D1, D1Stmt } from "./env";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function serve(bytes: Uint8Array) {
  const mock = vi.fn(async (_url: string, init: RequestInit) => {
    const range = (init.headers as Record<string, string>)["Range"] ?? "";
    const match = /bytes=(\d+)-(\d+)/.exec(range);
    if (!match) throw new Error("Range required");
    const start = Number(match[1]);
    const end = Number(match[2]);
    return new Response(bytes.slice(start, end + 1), { status: 206, headers: { "content-range": `bytes ${start}-${end}/${bytes.length}` } });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function id3() {
  const encoder = new TextEncoder();
  const frames = [["TIT2", "Tagged Song"], ["TPE1", "Tagged Artist"], ["TALB", "Tagged Album"]].map(([id, value]) => {
    const text = encoder.encode(value);
    const frame = new Uint8Array(11 + text.length);
    frame.set(encoder.encode(id));
    new DataView(frame.buffer).setUint32(4, text.length + 1);
    frame[10] = 3;
    frame.set(text, 11);
    return frame;
  });
  const size = frames.reduce((n, f) => n + f.length, 0);
  const bytes = new Uint8Array(4096);
  bytes.set([73, 68, 51, 3, 0, 0, 0, 0, size >> 7, size & 127]);
  let offset = 10;
  for (const frame of frames) { bytes.set(frame, offset); offset += frame.length; }
  return bytes;
}

function withLargeCover(version: 3 | 4) {
  const original = id3();
  const textSize = original[8] * 128 + original[9];
  const pictureSize = 2 * 1024 * 1024;
  const tagSize = 10 + pictureSize + textSize;
  const bytes = new Uint8Array(10 + tagSize + 4096);
  bytes.set([73, 68, 51, version, 0, 0, (tagSize >>> 21) & 127, (tagSize >>> 14) & 127, (tagSize >>> 7) & 127, tagSize & 127]);
  bytes.set(new TextEncoder().encode("APIC"), 10);
  if (version === 3) new DataView(bytes.buffer).setUint32(14, pictureSize);
  else bytes.set([(pictureSize >>> 21) & 127, (pictureSize >>> 14) & 127, (pictureSize >>> 7) & 127, pictureSize & 127], 14);
  bytes.set(original.subarray(10, 10 + textSize), 20 + pictureSize);
  return bytes;
}

describe("embedded song details", () => {
  it.each([3, 4] as const)("recovers ID3v2.%i text after a 2 MiB cover without downloading the cover body", async (version) => {
    const bytes = withLargeCover(version);
    const mock = serve(bytes);
    const tags = await readEmbeddedTags("https://media.example.test/song", bytes.length, "large-cover.mp3");
    expect(tags.common.title).toBe("Tagged Song");
    expect(tags.common.artist).toBe("Tagged Artist");
    expect(tags.common.album).toBe("Tagged Album");
    expect(tags.common.picture).toBeUndefined();
    const ranges = mock.mock.calls.map(([, init]) => (init.headers as Record<string, string>).Range);
    expect(ranges).toEqual([`bytes=0-65535`, `bytes=2097152-${bytes.length - 1}`]);
    expect(mock.mock.calls.length).toBeLessThanOrEqual(8);
    expect(65536 + bytes.length - 2097152).toBeLessThan(512 * 1024);
  });

  it("still refuses oversized text frames rather than relaxing the byte cap", async () => {
    const bytes = withLargeCover(3);
    bytes.set(new TextEncoder().encode("TIT2"), 10);
    serve(bytes);
    await expect(readEmbeddedTags("https://media.example.test/song", bytes.length, "song.mp3")).rejects.toThrow("byte budget");
    expect(TAG_BYTE_LIMIT).toBe(512 * 1024);
  });

  it("falls back to ID3v1 when an MP3 has no ID3v2 header", async () => {
    const bytes = new Uint8Array(4096);
    bytes.set(new TextEncoder().encode("TAGLegacy Title"), bytes.length - 128);
    serve(bytes);
    const tags = await readEmbeddedTags("https://media.example.test/song", bytes.length, "song.mp3");
    expect(tags.common.title).toBe("Legacy Title");
  });

  it("allows a slow response beyond fifteen seconds but stops at sixty seconds with a safe diagnostic", async () => {
    vi.useFakeTimers();
    const mock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("private download address")), { once: true });
    }));
    vi.stubGlobal("fetch", mock);
    const result = readEmbeddedTags("https://media.example.test/song", 4096, "song.mp3");
    const assertion = expect(result).rejects.toThrow("Music download timed out waiting for response headers");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mock.mock.calls[0]?.[1].signal?.aborted).toBe(false);
    expect(TAG_TIMEOUT_MS).toBe(60_000);
    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("follows a Microsoft media redirect while preserving ranges and never forwarding credentials", async () => {
    const bytes = id3();
    const rangeFetch = serve(bytes);
    const mock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://public.dm.files.1drv.com/song" } })).mockImplementation(rangeFetch);
    vi.stubGlobal("fetch", mock);
    const tags = await readEmbeddedTags("https://media.example.test/start", bytes.length, "song.mp3");
    expect(tags.common.title).toBe("Tagged Song");
    expect(mock.mock.calls[1]?.[0]).toBe("https://public.dm.files.1drv.com/song");
    expect(mock.mock.calls[1]?.[1].headers).toEqual({ Range: "bytes=0-4095" });
    expect(mock.mock.calls[1]?.[1].redirect).toBe("manual");
  });

  it("rejects redirects outside Microsoft media hosts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://untrusted.example.test/song" } })));
    const reader = new RangeTokenizer("https://media.example.test/start", 100, "song.mp3");
    await expect(reader.readBuffer(new Uint8Array(10))).rejects.toThrow("approved Microsoft HTTPS");
    await reader.close();
  });
  it("never exposes signed URLs or arbitrary parser messages in diagnostics", () => {
    expect(tagFailure(new Error("fetch failed https://private.test/?token=secret"))).toBe("Music download request failed or redirected");
    expect(tagFailure(new Error("unexpected private account data"))).toBe("Tag parser could not read this file");
  });
  it("reads real ID3 frames and replaces filename fallbacks", async () => {
    const bytes = id3();
    serve(bytes);
    const tags = await readEmbeddedTags("https://media.example.test/song", bytes.length, "filename.mp3");
    const row = itemToTrack({ id: "one", name: "filename.mp3", size: bytes.length, file: {} });
    if (!row) throw new Error("Expected audio row");
    const result = mergeTags(row, tags);
    expect(result.title).toBe("Tagged Song");
    expect(result.artist).toBe("Tagged Artist");
    expect(result.album).toBe("Tagged Album");
    expect(result.album_key).toBe("al-tagged-artist|tagged-album");
  });

  it("refuses a full-file response when ranges are ignored", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(100), { status: 200 })));
    const reader = new RangeTokenizer("https://media.example.test/file", 100, "file.mp3");
    await expect(reader.readBuffer(new Uint8Array(10))).rejects.toThrow("requested byte range");
    await reader.close();
  });

  it("limits each track to eight range requests and skips payload without fetching it", async () => {
    const bytes = new Uint8Array(1024 * 1024);
    const fetchMock = serve(bytes);
    const reader = new RangeTokenizer("https://media.example.test/file", bytes.length, "file.m4a");
    await reader.ignore(64 * 1024);
    expect(fetchMock).not.toHaveBeenCalled();
    for (let i = 0; i < TAG_REQUEST_LIMIT; i++) {
      await reader.peekBuffer(new Uint8Array(1), { position: i * 64 * 1024 });
    }
    await expect(reader.peekBuffer(new Uint8Array(1), { position: 8 * 64 * 1024 })).rejects.toThrow("budget");
    expect(fetchMock).toHaveBeenCalledTimes(8);
    await reader.close();
  });

  it("selects and counts pending tracks only for the authenticated owner", async () => {
    const bind = vi.fn();
    const stmt: D1Stmt = { bind, all: vi.fn().mockResolvedValue({ results: [] }), first: vi.fn().mockResolvedValue({ total: 0, processed: 0 }), run: vi.fn() };
    bind.mockReturnValue(stmt);
    const db: D1 = { prepare: vi.fn().mockReturnValue(stmt), batch: vi.fn() };
    expect(await metadataStep({}, db, "owner-a")).toMatchObject({ done: true, total: 0 });
    expect(bind.mock.calls).toEqual([["owner-a"], ["owner-a"]]);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("WHERE user_id=? AND tag_status='pending'"));
  });

  it("requeues only the owner's unavailable files, without resetting completed files", async () => {
    const bind = vi.fn();
    const stmt: D1Stmt = { bind, all: vi.fn().mockResolvedValue({ results: [] }), first: vi.fn().mockResolvedValue({ total: 0, processed: 0 }), run: vi.fn().mockResolvedValue({}) };
    bind.mockReturnValue(stmt);
    const db: D1 = { prepare: vi.fn().mockReturnValue(stmt), batch: vi.fn() };
    await metadataStep({}, db, "owner-a", false, true);
    expect(db.prepare).toHaveBeenCalledWith("UPDATE music_files SET tag_status='pending' WHERE user_id=? AND tag_status='unavailable'");
    expect(bind.mock.calls).toEqual([["owner-a"], ["owner-a"], ["owner-a"]]);
  });
});