import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SetupNotice } from "@/components/SetupNotice";
import { api, type MeResponse } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OneDrive for Eclipse Music — your library, your addon" },
      { name: "description", content: "Connect your own Microsoft OneDrive and stream your music in Eclipse Music with a private addon link." },
      { property: "og:title", content: "OneDrive for Eclipse Music" },
      { property: "og:description", content: "Connect your own OneDrive and stream your music in Eclipse Music." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STEPS = [
  ["Create an account", "Sign up with your email."],
  ["Connect OneDrive", "Sign in on Microsoft's own page. We only ask to read your files."],
  ["Scan your music", "We index song details. Your files stay in OneDrive."],
  ["Add to Eclipse", "Paste your private link in Settings → Connections → Add Connection → Addon."],
];

function Index() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<MeResponse>("/api/me").then((m) => {
      setMe(m);
      if (m.user) navigate({ to: "/dashboard" });
    }).catch(() => {});
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <section className="relative mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
        <div aria-hidden className="corona pointer-events-none absolute -left-40 -top-40 size-[34rem] opacity-60" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">For Eclipse Music</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight md:text-6xl">Your OneDrive music, playing in Eclipse.</h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            Connect your own OneDrive and get a private addon link for{" "}
            <a className="text-primary underline-offset-4 hover:underline" href="https://eclipsemusic.app/" target="_blank" rel="noreferrer">Eclipse Music</a>.
            Songs stream straight from your OneDrive. Nothing is copied to our servers.
          </p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-xl border border-border bg-card/60 p-4">
                <span className="font-display text-sm text-primary">0{i + 1}</span>
                <p className="mt-1 font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative self-start rounded-2xl border border-border bg-card p-6 shadow-2xl">
          {me && <div className="mb-4"><SetupNotice configured={me.configured} /></div>}
          <h2 className="text-2xl font-semibold">{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={mode === "signup" ? 10 : 1}
                autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode === "signup" && <p className="text-xs text-muted-foreground">At least 10 characters.</p>}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Sign up" : "Sign in"}</Button>
          </form>
          <button type="button" className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}>
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 border-t border-border pt-10 md:grid-cols-3">
          <div>
            <h3 className="font-semibold">Read-only access</h3>
            <p className="mt-2 text-sm text-muted-foreground">We ask Microsoft only for permission to read your files. We can't change, delete or upload anything.</p>
          </div>
          <div>
            <h3 className="font-semibold">Private to you</h3>
            <p className="mt-2 text-sm text-muted-foreground">Your addon link only opens your library. You can turn it off or replace it at any time.</p>
          </div>
          <div>
            <h3 className="font-semibold">Independent project</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Not made by Eclipse Music. Addon format follows the{" "}
              <a className="text-primary hover:underline" href="https://eclipsemusic.app/docs" target="_blank" rel="noreferrer">official docs</a>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
