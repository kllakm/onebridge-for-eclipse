import { describe, expect, it } from "vitest";
import { itemToTrack, streamHints } from "./library";
import { decryptString, encryptString, hashPassword, sha256Hex, verifyPassword } from "./crypto";

describe("library indexing", () => {
  it("ignores non-audio files like photos and documents", () => {
    expect(itemToTrack({ id: "1", name: "holiday.jpg", file: {} })).toBeNull();
    expect(itemToTrack({ id: "2", name: "notes.docx", file: {} })).toBeNull();
  });

  it("uses embedded tags over the filename and converts duration to seconds", () => {
    const t = itemToTrack({
      id: "x", name: "01 track.flac", file: {},
      audio: { title: "Real Title", artist: "Real Artist", album: "LP", duration: 245_600 },
    })!;
    expect(t.title).toBe("Real Title");
    expect(t.artist).toBe("Real Artist");
    expect(t.duration).toBe(246);
  });

  it("falls back to 'Artist - Title' filenames when tags are missing", () => {
    const t = itemToTrack({ id: "y", name: "Nina Simone - Feeling Good.mp3", file: {} })!;
    expect(t.artist).toBe("Nina Simone");
    expect(t.title).toBe("Feeling Good");
  });

  it("does not claim a codec for m4a, which may be AAC or ALAC", () => {
    expect(streamHints("m4a")["codec"]).toBeUndefined();
  });
});

describe("security helpers", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong password!!", h)).toBe(false);
  });

  it("encrypts tokens so the stored value differs and round-trips", async () => {
    const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    const ct = await encryptString("refresh-token-abc", key);
    expect(ct).not.toContain("refresh-token-abc");
    expect(await decryptString(ct, key)).toBe("refresh-token-abc");
  });

  it("stores addon tokens as a hash, not the token itself", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
