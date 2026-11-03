# Missing music metadata
- [x] Add bounded embedded-tag extraction with a Worker-compatible parser.
- [x] Add a resumable metadata scan for existing tracks and progress counts.
- [x] Test tag extraction and owner isolation; document deployment and retesting.
- [x] Add safe diagnostics and pause metadata reading on failure.
- [x] Handle bounded Microsoft media redirects and separate download error diagnostics.
- [x] Extend the bounded tag-read wait and distinguish header/body timeouts; test cancellation.
- [x] Resolve deployed metadata failure — owner reports tags now recovering; full-library completion remains unverified.
- [x] Investigate reported safe-read-limit diagnostic — current reader caps both bytes and requests; the specific exhausted limit remains unverified.

# OneBridge testing update
- [x] Apply supplied OneBridge branding and favicon without changing playback.
- [x] Block new signups while preserving existing sign-in.
- [x] Show clear progress during sync changes and full rescan.