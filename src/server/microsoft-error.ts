// Only expose diagnostic identifiers, never Microsoft's full callback payload.
export function microsoftErrorCode(params: URLSearchParams): string {
  const aadsts = params.get("error_description")?.match(/\bAADSTS\d{4,10}\b/);
  if (aadsts) return aadsts[0];
  const code = params.get("error") ?? "";
  return /^[a-z_]{1,64}$/.test(code) ? code : "unknown";
}