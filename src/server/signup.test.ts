import { describe, expect, it } from "vitest";
import { signupClosed } from "./signup";

describe("testing access", () => {
  it("rejects new account creation with HTTP 403 and creates no session", async () => {
    const response = signupClosed();
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});