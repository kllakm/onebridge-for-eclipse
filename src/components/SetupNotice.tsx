import type { MeResponse } from "@/lib/api";

export function SetupNotice({ configured }: { configured: MeResponse["configured"] }) {
  const missing = [
    !configured.database && "Cloudflare D1 database (binding DB)",
    !configured.microsoft && "Microsoft app ID and secret",
    !configured.encryption && "Token encryption key",
  ].filter(Boolean) as string[];
  if (!missing.length) return null;
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
      <p className="font-semibold text-primary">Service not set up yet</p>
      <p className="mt-1 text-muted-foreground">
        This copy of the app is missing: {missing.join(", ")}. Follow docs/DEPLOY.md to deploy it to Cloudflare.
      </p>
    </div>
  );
}
