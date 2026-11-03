import { describe, expect, it, vi } from "vitest";
import { safe } from "./http";

describe("safe database errors", () => {
  it("identifies missing schema without returning database details or secrets", async () => {
    const response = await safe(async () => { throw new Error("D1_ERROR: no such table: music_tracks private-secret"); });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("upgrade is incomplete");
    expect(body.error).not.toContain("private-secret");
  });
  it("distinguishes exhausted allowance from an incomplete migration", async () => {
    const response = await safe(async () => { throw new Error("D1 daily read limit exceeded"); });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("allowance has been exhausted");
  });
  it("does not classify unrelated internal errors as schema failures", async () => {
    const log = vi.spyOn(console,"error").mockImplementation(() => {});
    try {
      const response = await safe(async () => { throw new Error("unexpected failure"); });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({error:"Internal error"});
    } finally { log.mockRestore(); }
  });
});