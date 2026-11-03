# Missing music metadata
- [x] Replace per-batch full-library progress counts with transactional owner counters; test retries, deletion and isolation.
- [x] Surface dashboard load failures and document safe incomplete-migration diagnosis.
- [ ] Repair external incomplete migration and measure deployed quota usage — waiting on owner's schema inventory/failed response and deployment of 0005.
- [x] Add bounded embedded-tag extraction with a Worker-compatible parser.
- [x] Add a resumable metadata scan for existing tracks and progress counts.
- [x] Test tag extraction and owner isolation; document deployment and retesting.
- [x] Add safe diagnostics and pause metadata reading on failure.
- [x] Handle bounded Microsoft media redirects and separate download error diagnostics.
- [x] Extend the bounded tag-read wait and distinguish header/body timeouts; test cancellation.
- [x] Resolve deployed metadata failure — owner reports tags now recovering; full-library completion remains unverified.
- [x] Investigate reported safe-read-limit diagnostic — current reader caps both bytes and requests; the specific exhausted limit remains unverified.
- [x] Read MP3 text frames selectively, skipping large pictures with bounded requests; test large-cover recovery.
- [x] Speed tag batches with shared connection lookup and bounded parallel reads; add owner-scoped failed-file retry.
- [x] Verify tests and simulated dashboard flow; document external OneDrive speed checks still required.
- [x] Implement small safe D1 storage savings without a schema overhaul; migration and unmeasured deployed size documented.
- [x] Move displayed logo and donation SVGs to public files for independent Cloudflare hosting; verify images.
- [ ] Apply latest storage migration and measure deployed scan speed/size — requires owner's Cloudflare access and deployment.

# Compact shared library
- [x] Replace repeated artist/album names with owner-scoped shared records and compact integer references; reset only music index.
- [x] Update scan, metadata writes and cleanup while preserving Eclipse read responses and stable IDs.
- [x] Test actual SQLite read/write flows, ownership, reset, deduplication and representative size; document migration/rescan steps.
- [x] Answer TorBox database-storage feasibility as research only; no TorBox implementation changes.

# OneBridge testing update
- [x] Move main-page donation section directly beneath login; verified visible without desktop scrolling.
- [x] Clarify existing-row cleanup and distinguish implemented small savings from proposed shared album/artist storage.
- [x] Apply supplied OneBridge branding and favicon without changing playback.
- [x] Block new signups while preserving existing sign-in.
- [x] Show clear progress during sync changes and full rescan.

# Future: BYO database via Turso (decided, not started)
- [ ] Keep accounts, sessions and connections on the owner's D1; move each user's music library and metadata to that user's own Turso database.
- [ ] Test Turso compatibility of the compact schema (WITHOUT ROWID, INSTEAD OF triggers, partial indexes) before committing.
- [ ] Design guided dashboard setup: sign up at Turso, paste connection details, connect, auto-create tables.