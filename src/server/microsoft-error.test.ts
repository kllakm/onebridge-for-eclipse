import { describe, expect, it } from "vitest";
import { microsoftErrorCode } from "./microsoft-error";

describe("Microsoft callback diagnostics", () => {
  it("extracts the diagnostic identifier without exposing account details", () => {
    expect(microsoftErrorCode(new URLSearchParams({
      error: "access_denied",
      error_description: "AADSTS65001: account private@example.com failed; code=secret",
    }))).toBe("AADSTS65001");
  });

  it("preserves a provider error code when there is no AADSTS identifier", () => {
    expect(microsoftErrorCode(new URLSearchParams({ error: "invalid_client" }))).toBe("invalid_client");
  });

  it("does not reflect arbitrary callback content", () => {
    expect(microsoftErrorCode(new URLSearchParams({ error: "<script>private-token</script>" }))).toBe("unknown");
  });
});