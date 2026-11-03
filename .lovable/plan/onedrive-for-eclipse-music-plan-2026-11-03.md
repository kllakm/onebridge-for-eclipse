# OneDrive for Eclipse Music: plan

## What the official docs show (eclipsemusic.app/docs)
- An Eclipse addon is a plain web server. Users install it by pasting its URL into Eclipse.
- Required: `GET /manifest.json`, `GET /search?q=`, `GET /stream/{id}`. Optional: `/album/{id}`, `/artist/{id}`, `/playlist/{id}`, catalogs.
- Because users paste a full URL, a per-user link such as `https://<app>/addon/<token>/manifest.json` fits the model. This lets each user have their own library.
- Not confirmed yet: how the Android and Web apps differ (CORS, seeking, formats), and whether `/stream` can return a short-lived OneDrive download link. Phase 1 checks these. Anything the docs don't cover is marked unverified.

## Your choices
- Database: Cloudflare D1 only. I write the code and setup steps, and you deploy to Cloudflare. The preview here won't have a working database, so I can't test the full flow inside Lovable.
- Microsoft sign-in: your own Azure app registration, with read-only permissions (`Files.Read`, `offline_access`, `User.Read`).

## Phase 1: Research and feasibility (written report, no dashboard)
1. Read the rest of the Eclipse docs (stream response, catalogs, hosting, requirements, install, FAQ) and the Node example. Look at real addons.
2. Microsoft Graph: confirm that `@microsoft.graph.downloadUrl` gives a pre-authenticated, short-lived link that supports byte ranges, and check how long it lasts. Check delta sync and how to read track details without downloading whole files.
3. Feasibility report saved in the project: what works, what is unverified, the streaming approach (fresh redirect per play, so no audio passes through the server), and the risks.

## Phase 2: Minimal working prototype
- Cloudflare Worker routes: email sign-in, Microsoft OAuth start and callback, scan the chosen folder, and the addon endpoints `manifest`, `search`, `stream`, `album`, `artist`.
- D1 tables: users, sessions, microsoft_connections (tokens encrypted), music_files, sync_state, addon_tokens (stored hashed), audit_logs.
- Every query is filtered by the owner on the server. Each addon token maps to exactly one user.
- A bare-bones page to connect OneDrive, scan the library, and copy the addon URL.
- You test playback, including seeking, in Eclipse Android and Eclipse Web, with two accounts to confirm they stay separate. I'll give you a checklist. I can't play audio inside Eclipse myself.

## Phase 3 (only after the prototype works)
Full user dashboard, account settings and deletion, folder selection, incremental sync, a separate admin area with server-side admin checks, diagnostics, and deployment docs (GitHub to Cloudflare Pages + Workers + D1, secrets via Wrangler).

## Technical notes
- The Lovable template already runs on Cloudflare Workers (TanStack Start). D1 is accessed through a `wrangler` binding. Lovable Cloud is not used.
- Secrets (MS_CLIENT_ID, MS_CLIENT_SECRET, TOKEN_ENC_KEY, SESSION_SECRET) are set in Cloudflare and never sent to the browser.
- Addon tokens: 32 random bytes, stored as SHA-256 hashes, and can be revoked or regenerated.
- The admin page cannot edit Cloudflare secrets securely from the browser. It will show whether each one is set (masked) and link to the Wrangler commands.
