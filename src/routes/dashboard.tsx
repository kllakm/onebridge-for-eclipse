import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SetupNotice } from "@/components/SetupNotice";
import { api, type MeResponse } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your library — OneDrive for Eclipse Music" },
      { name: "description", content: "Connect OneDrive, scan your music and get your private Eclipse Music addon link." },
      { property: "og:title", content: "Your library — OneDrive for Eclipse Music" },
      { property: "og:description", content: "Manage your OneDrive connection and Eclipse addon link." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const ONEDRIVE_MSG: Record<string, string> = {
  connected: "OneDrive connected. Now scan your music.",
  cancelled: "Microsoft sign-in was cancelled.",
  provider_error: "Microsoft could not complete sign-in.",
  expired: "That sign-in link expired. Please try again.",
  failed: "Microsoft sign-in failed. Please try again.",
  invalid: "Microsoft sign-in returned an unexpected response.",
  error: "Something went wrong connecting OneDrive.",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [folder, setFolder] = useState("");
  const [addonUrl, setAddonUrl] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [readingTags, setReadingTags] = useState(false);
  const [tagProgress, setTagProgress] = useState<{ processed: number; total: number; tagged: number; unavailable: number; done: boolean } | null>(null);

  const load = useCallback(async () => {
    const m = await api<MeResponse>("/api/me");
    if (!m.user && m.configured.database) {
      navigate({ to: "/" });
      return;
    }
    setMe(m);
    setFolder(m.connection?.folder ?? "Music");
  }, [navigate]);

  useEffect(() => {
    load().catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const msg = params.get("onedrive");
    if (msg && ONEDRIVE_MSG[msg]) {
      const diagnostic = params.get("microsoft_error");
      const safeDiagnostic = diagnostic && /^(AADSTS\d{4,10}|[a-z_]{1,64})$/.test(diagnostic) ? diagnostic : null;
      const message = ONEDRIVE_MSG[msg] + (safeDiagnostic ? ` Microsoft error: ${safeDiagnostic}.` : "");
      if (msg === "connected") toast.success(message);
      else setConnectionError(message);
      window.history.replaceState(null, "", "/dashboard");
    }
  }, [load]);

  async function scan(opts: { full?: boolean; folder?: string } = {}) {
    setScanning(true);
    try {
      let body: Record<string, unknown> = opts;
      for (let i = 0; i < 200; i++) {
        const r = await api<{ done: boolean; trackCount: number }>("/api/onedrive/scan", { method: "POST", body: JSON.stringify(body) });
        body = {};
        if (r.done) {
          toast.success(`Library ready: ${r.trackCount} tracks`);
          break;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
      load();
    }
  }

  async function makeLink() {
    if (me?.addonTokenCreatedAt && !confirm("Your current addon link will stop working. Continue?")) return;
    try {
      const r = await api<{ url: string }>("/api/addon-token", { method: "POST" });
      setAddonUrl(r.url);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create link");
    }
  }

  async function readTags() {
    setReadingTags(true);
    try {
      let done = false;
      while (!done) {
        const result = await api<{ processed: number; total: number; tagged: number; unavailable: number; done: boolean }>("/api/onedrive/metadata", { method: "POST" });
        setTagProgress(result);
        done = result.done;
      }
      toast.success("Song details updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read song details");
    } finally {
      setReadingTags(false);
      load();
    }
  }

  async function revoke() {
    if (!confirm("Turn off your addon link? Eclipse will stop playing your OneDrive music.")) return;
    await api("/api/addon-token", { method: "DELETE" });
    setAddonUrl(null);
    load();
  }

  async function disconnect() {
    if (!confirm("Disconnect OneDrive? This removes your library index and turns off your addon link.")) return;
    await api("/api/onedrive/disconnect", { method: "POST" });
    setAddonUrl(null);
    load();
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    navigate({ to: "/" });
  }

  if (!me) return <main className="grid min-h-screen place-items-center text-muted-foreground">Loading…</main>;

  const tracks = me.sync?.track_count ?? 0;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">OneDrive for Eclipse</p>
          <h1 className="mt-1 text-3xl font-bold">Your library</h1>
        </div>
        {me.user && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{me.user.email}</span>
            <Button variant="outline" size="sm" onClick={logout}>Sign out</Button>
          </div>
        )}
      </header>

      <div className="mt-6"><SetupNotice configured={me.configured} /></div>
      {connectionError && <p role="alert" className="mt-6 rounded-lg border border-destructive bg-card p-4 text-sm text-destructive">{connectionError}</p>}

      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">1. Microsoft OneDrive</h2>
        {me.connection ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm"><span className="mr-2 inline-block size-2 rounded-full bg-success" />Connected as <strong>{me.connection.email}</strong></p>
            <Button variant="outline" size="sm" onClick={disconnect}>Disconnect OneDrive</Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">You'll sign in on Microsoft's own page. We only ask to read your files and your basic profile.</p>
            <Button asChild><a href="/api/onedrive/connect">Connect Microsoft OneDrive</a></Button>
          </div>
        )}
      </section>

      {me.connection && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">2. Music library</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Tracks" value={tracks} />
            <Stat label="Artists" value={me.counts?.artists ?? 0} />
            <Stat label="Albums" value={me.counts?.albums ?? 0} />
            <Stat label="Last scan" value={me.sync?.last_sync_at ? new Date(me.sync.last_sync_at).toLocaleDateString() : "Never"} />
          </div>
          {me.sync?.status === "error" && me.sync.last_error && (
            <p className="mt-3 text-sm text-destructive">Last scan problem: {me.sync.last_error}</p>
          )}
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="folder">Music folder in your OneDrive</Label>
              <Input id="folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Music" />
            </div>
            {folder !== me.connection.folder ? (
              <Button disabled={scanning || readingTags} onClick={() => scan({ folder })}>Save folder & scan</Button>
            ) : (
              <>
                <Button disabled={scanning || readingTags} onClick={() => scan()}>{scanning ? "Scanning…" : tracks ? "Sync changes" : "Scan library"}</Button>
                {tracks > 0 && <Button variant="outline" disabled={scanning || readingTags} onClick={() => scan({ full: true })}>Full rescan</Button>}
              </>
            )}
          </div>
          {tracks > 0 && <div className="mt-4 space-y-2">
            <Button variant="outline" disabled={scanning || readingTags} onClick={readTags}>{readingTags ? "Reading song details…" : "Read song details"}</Button>
            {tagProgress && <p role="status" className="text-sm text-muted-foreground">{tagProgress.processed} / {tagProgress.total} checked · {tagProgress.tagged} with tags · {tagProgress.unavailable} unavailable</p>}
          </div>}
        </section>
      )}

      {me.connection && tracks > 0 && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">3. Add to Eclipse Music</h2>
          {addonUrl ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-primary">Copy this link now — for your security it's only shown once.</p>
              <div className="flex gap-2">
                <Input readOnly value={addonUrl} onFocus={(e) => e.currentTarget.select()} />
                <Button onClick={() => { navigator.clipboard.writeText(addonUrl); toast.success("Copied"); }}>Copy</Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {me.addonTokenCreatedAt
                ? `Your addon link is active (created ${new Date(me.addonTokenCreatedAt).toLocaleDateString()}). Lost it? Make a new one — the old one will stop working.`
                : "Create your private addon link."}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={makeLink}>{me.addonTokenCreatedAt ? "Make a new link" : "Create addon link"}</Button>
            {me.addonTokenCreatedAt && <Button variant="outline" onClick={revoke}>Turn off link</Button>}
          </div>
          <ol className="mt-6 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Open Eclipse Music (app or <a className="text-primary hover:underline" href="https://eclipsemusic.app/web/" target="_blank" rel="noreferrer">web</a>).</li>
            <li>Go to Settings → Connections → Add Connection → Addon.</li>
            <li>Paste your link and tap Install.</li>
            <li>Pick "My OneDrive Music" in the search dropdown and search for a song.</li>
          </ol>
        </section>
      )}
    </main>
  );
}
