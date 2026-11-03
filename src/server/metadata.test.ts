import { afterEach, describe, expect, it, vi } from "vitest";
import { readEmbeddedTags, mergeTags, metadataStep } from "./metadata";
import { RangeTokenizer, TAG_REQUEST_LIMIT } from "./range-tokenizer";
import { itemToTrack } from "./library";
import type { D1, D1Stmt } from "./env";

afterEach(() => vi.unstubAllGlobals());

function serve(bytes: Uint8Array) {
  const mock = vi.fn(async (_url: string, init: RequestInit) => {
    const range = (init.headers as Record<string, string>).Range;
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

describe("embedded song details", () => {
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
});