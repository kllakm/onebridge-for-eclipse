# Feasibility report — OneDrive for Eclipse Music

Sources: https://eclipsemusic.app/docs (read Nov 2026) and Microsoft Graph documentation.
Status labels: **Confirmed (docs)**, **Assumed — needs testing**, **Unverified**.

## 1. Eclipse Music addon model — Confirmed (docs)
- An addon is any HTTPS server that returns JSON. Required endpoints: `GET /manifest.json`, `GET /search?q=`, `GET /stream/{id}`. Optional: `/album/{id}`, `/artist/{id}`, `/playlist/{id}`, `/catalog/{id}`, `/resolve-isrc`, `/resolve`.
- Requirements: HTTPS, `Access-Control-Allow-Origin: *`, `Content-Type: application/json`, search under 5 s, stream under 3 s.
- **Per-user URLs are officially supported.** From the docs FAQ: "you can include tokens in your addon URL (e.g. `https://my-addon.com/{user_token}/manifest.json`). Eclipse stores the full URL" and "strips `/manifest.json` and uses the rest as the base URL." So the design `https://<app>/addon/<token>/manifest.json` matches the spec.
- `/stream/{id}` returns `{ url, format?, expiresAt?, codec?, container?, manifest? ... }`. The URL "must be a direct link to an audio file - no HTML pages, no redirects to login pages". `expiresAt` exists for expiring URLs, and Eclipse calls `/stream/{id}` again to get a fresh URL.
- Supported formats listed: MP3, AAC, M4A, FLAC, WAV, OGG. **Not listed: OPUS, WMA, ALAC.** The scanner indexes them, but playback is unverified.
- Install: Settings → Connections → Add Connection → Addon → paste the URL → Install.
- "Cloudflare Workers" is listed as a supported hosting option.

## 2. Platforms — partly unverified
- The docs mention iPhone/iPad, AVFoundation, AirPlay and CarPlay, so there is an iOS app. They do not describe Android- or Web-specific addon behaviour.
- **Unverified:** whether Eclipse Web plays a OneDrive download URL in the browser. A plain `<audio>` element doesn't need CORS. But if the Web app uses Web Audio (EQ/reverb), the audio host must send CORS headers. Whether OneDrive download hosts send `Access-Control-Allow-Origin` must be tested.
- **Unverified:** seeking on each platform. OneDrive download URLs are expected to support HTTP `Range` requests (needs testing).

## 3. Microsoft Graph — Confirmed (Microsoft docs) unless noted
- OAuth 2.0 authorization-code flow on the Microsoft identity platform, with tenant `common` (personal + work/school).
- Minimum scopes: `Files.Read` (read the user's files), `offline_access` (refresh token), `User.Read` + `openid email` (identify the account). No write scopes.
- `GET /me/drive/items/{id}?$select=@microsoft.graph.downloadUrl` returns a **pre-authenticated, short-lived** URL that needs no auth header. This is what we give Eclipse. Microsoft documents it as valid for a short time, so we advertise `expiresAt` = now + 10 minutes (conservative; **actual lifetime unverified**).
- The `audio` facet on driveItems gives title/artist/album/track/disc/year/genre/duration **without downloading the file**. **Assumed — needs testing:** this facet is reliably filled in for OneDrive Personal but may be missing on OneDrive for Business. If so, a range-read tag parser would be needed (phase 3).
- Delta query (`/delta`) supports incremental sync with `@odata.nextLink` / `@odata.deltaLink`. **Limitation:** delta on a *folder* (not the drive root) is only supported for OneDrive Personal. Business accounts may need root delta plus a path filter (phase 3).
- Artwork: driveItem thumbnails are also short-lived URLs. Not included in the prototype (unverified).

## 4. Streaming architecture
Audio never passes through our server: `/stream/{id}` checks ownership, refreshes the user's Microsoft token if needed, asks Graph for a fresh `downloadUrl`, and returns it in JSON. This is 1–2 Graph calls per play and fits the Worker CPU and subrequest limits easily.
Risk: tracks saved to Eclipse playlists store the stream URL. Because ours expires, those tracks need the addon installed so Eclipse can call `/stream/{id}` again. The docs describe this behaviour.

## 5. Cloudflare Workers
TanStack Start builds to a Cloudflare Worker. One Worker serves the web pages, the JSON API and the addon endpoints. Deployed via Cloudflare Workers Builds from GitHub (the build merges `wrangler.jsonc` into its generated config). A separate Pages project is not needed: it would add a second deployment and a cross-origin cookie problem for no benefit. D1 is bound as `DB`, and secrets are set with `wrangler secret put`.
Scanning is split into steps (5 Graph pages per request) to stay under Worker subrequest limits. The dashboard repeats steps until done.

## 6. Security model
- Addon token: 32 random bytes, shown once, stored as SHA-256. Each token maps to exactly one user. It is revoked automatically on disconnect.
- Microsoft tokens are AES-256-GCM encrypted in D1 (`TOKEN_ENC_KEY`), never sent to the browser or Eclipse, and never logged.
- Every SQL query on user data includes `user_id = ?`. `/stream/{id}` also checks that the item is in that user's index before calling Graph.
- Passwords: PBKDF2-SHA256 with 100k iterations (workerd maximum). Sessions use an HttpOnly, Secure, SameSite=Lax cookie, stored hashed.

## 7. What still needs real-world testing
See docs/TEST-CHECKLIST.md. Nothing in sections 2–3 marked unverified should be treated as working until it has been tested on a real device.

## 8. Microsoft sign-in diagnostics
- Reported during deployment testing on 3 Nov 2026: Microsoft returns to the app after entering a username, before a password prompt. The previous callback labelled every provider error as cancellation; that message did not establish the cause.
- The callback now validates the one-time state and displays only the Microsoft error identifier (AADSTS code when available), not account details or the full callback payload. Diagnostic extraction is covered by automated tests.
- **Unverified:** the actual Microsoft configuration/account error and successful sign-in on the owner's deployed Worker. Retry after Cloudflare deploys this update and capture the displayed identifier.
- Owner subsequently confirmed connection, library scanning and filename search in Eclipse Web. Microsoft rejected the personal-only registration at the `/common` endpoint; correcting the audience allowed connection.

## 9. Playback and metadata testing (3 Nov 2026)
- Owner reports Eclipse Web changes Play to Pause but no audio plays. The stream response is `404 {"error":"No download URL for this file"}`: the Graph item lookup returned no download URL annotation.
- Added a fallback to Graph `/me/drive/items/{id}/content`, reading its 302 Location with manual redirect handling. The server does not follow the redirect or proxy audio. Automated tests cover annotation success, missing-annotation fallback, owner-scoped token lookup and missing-file errors.
- **Unverified:** successful playback with this fallback on the deployed Worker, audio-host CORS and seeking. Requires retry after deployment.
- Owner reports filename-only metadata despite embedded tags. The scanner relies on Graph's audio facet, not embedded-tag extraction. Microsoft documents this facet as OneDrive Personal only; metadata recovery remains unresolved.
- Owner subsequently confirmed files play in Eclipse Web with the fallback. Skipping songs has a reported 5–6 second delay; immediate stopping is controlled by Eclipse. Seeking and other platforms remain unverified.

## 10. Embedded metadata enrichment
- Added a separate **Read song details** action for existing indexed files; no full rescan or new addon link is required. It resumes pending rows after interruption and displays checked/tagged/unavailable counts.
- Apply `migrations/0002_metadata.sql` in the owner's D1 console before using it. Existing rows are pending; ordinary delta replacements requeue changed files. No Microsoft permissions or secrets change.
- The music-metadata parser reads bounded HTTP ranges: at most 8 requests / 512 KiB per file, 64 KiB per range, three files per request. Full-file responses are rejected and cancelled. Artwork is skipped, and scanning audio to calculate duration is disabled.
- Tags update title, artist, album, album artist, track/disc, genre, year and available duration. Filename values are preserved when fields are absent; failed or over-budget files are marked unavailable instead of endlessly retried. Full rescan requeues those files if needed.
- **Unverified:** actual OneDrive range behavior and metadata recovery after deployment; unusually large tags or unsupported layouts can exceed the budget. Artwork extraction is not included.
- Owner reported widespread unavailable results. Added allowlisted stage/error diagnostics, automatic pause on failure, and **Check one failed file** to retry one unavailable item without rescanning the library. No root cause is established yet; raw parser errors and signed media URLs are never displayed.
- One-file diagnostic reports a download request failure or redirect before metadata parsing. The previous range fetch rejected all redirects. Added bounded manual Microsoft HTTPS media redirects, preserving Range and sending no bearer credentials; redirects count toward the eight-request budget. Diagnostics now distinguish connection failures, redirect rejection and HTTP range response status. **Unverified:** whether redirects caused the deployed failure; retry one failed file after deployment.
