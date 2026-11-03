# Missing music metadata
- [x] Add bounded embedded-tag extraction with a Worker-compatible parser.
- [x] Add a resumable metadata scan for existing tracks and progress counts.
- [x] Test tag extraction and owner isolation; document deployment and retesting.
- [x] Add safe diagnostics and pause metadata reading on failure.
- [x] Handle bounded Microsoft media redirects and separate download error diagnostics.
- [x] Extend the bounded tag-read wait and distinguish header/body timeouts; test cancellation.
- [ ] Resolve deployed metadata failure — waiting for a one-file retest with the 60-second limit.