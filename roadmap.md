# Missing music metadata
- [x] Add bounded embedded-tag extraction with a Worker-compatible parser.
- [x] Add a resumable metadata scan for existing tracks and progress counts.
- [x] Test tag extraction and owner isolation; document deployment and retesting.
- [x] Add safe diagnostics and pause metadata reading on failure.
- [x] Handle bounded Microsoft media redirects and separate download error diagnostics.
- [x] Extend the bounded tag-read wait and distinguish header/body timeouts; test cancellation.
- [x] Resolve deployed metadata failure — owner reports tags now recovering; full-library completion remains unverified.
- [x] Investigate reported safe-read-limit diagnostic — current reader caps both bytes and requests; the specific exhausted limit remains unverified.
- [ ] Read MP3 text frames selectively, skipping large pictures with bounded requests; test large-cover recovery.
- [ ] Speed tag batches with shared connection lookup and bounded parallel reads; add owner-scoped failed-file retry.
- [ ] Verify tests and dashboard flow; document external OneDrive speed checks still required.
- [ ] Review and implement small safe D1 storage savings without a schema overhaul; document unmeasured deployed size and any required migration.

# OneBridge testing update
- [x] Apply supplied OneBridge branding and favicon without changing playback.
- [x] Block new signups while preserving existing sign-in.
- [x] Show clear progress during sync changes and full rescan.