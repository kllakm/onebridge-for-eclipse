<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Backend is Cloudflare Workers + D1 (not Lovable Cloud): the owner deploys to their own Cloudflare account, so D1 is accessed via the `DB` binding resolved in `src/server/env.ts`.
- One Worker serves the UI, `/api/*` and the Eclipse addon under `/addon/$token/*`; this avoids cross-origin session cookies.
- Every query on user data filters by `user_id`, and addon requests resolve the URL token to exactly one user first (`addonHandler`) — server-side isolation is the security boundary.
- Microsoft tokens are AES-GCM encrypted at rest and only touched in `src/server/graph.ts`; audio is never proxied — `/stream` returns a fresh OneDrive downloadUrl.
- Schema changes go in a new file under `migrations/` (D1 migrations), never by editing applied ones.
- Feasibility findings and unverified items live in `docs/FEASIBILITY.md`; keep it updated when something is tested.
- Microsoft OAuth failures expose only allowlisted diagnostic identifiers after state validation, never raw callback descriptions; this enables troubleshooting without leaking account details.
- Embedded tags use bounded range reads and music-metadata decoding; ordinary MP3 text frames are compacted before decoding to skip artwork bodies, with bounded fallback for unsupported ID3 layouts. Three concurrent files share a request-local owner token to avoid redundant refreshes and stay within Worker limits; audio playback remains direct-file.
- Signup availability must be enforced at the server endpoint, not just hidden in the UI, so direct requests cannot bypass testing access restrictions.
- Displayed images and favicons live in public files and use same-origin paths so standalone Worker deployments have no Lovable asset-service dependency.
