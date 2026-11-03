# Prototype test checklist

Use two different Microsoft accounts (A and B), each with a few songs in a `Music` folder.
Include at least one MP3, one FLAC and one M4A.

| # | Test | Android | Web | Notes |
|---|------|---------|-----|-------|
| 1 | Sign up as user A, connect Microsoft account A | n/a | n/a | |
| 2 | Scan library: track count matches the files | n/a | n/a | |
| 3 | Create addon link, paste it into Eclipse, manifest preview shows "My OneDrive Music" | ☐ | ☐ | |
| 4 | Search for a song from A's library: it appears | ☐ | ☐ | |
| 5 | Open an album and an artist from results | ☐ | ☐ | |
| 6 | Play MP3 | ☐ | ☐ | |
| 7 | Play FLAC | ☐ | ☐ | |
| 8 | Play M4A | ☐ | ☐ | |
| 9 | Seek to the middle of a track | ☐ | ☐ | |
| 10 | Pause for 15+ minutes, then play again (URL expiry) | ☐ | ☐ | |
| 11 | Repeat 1–4 as user B: B sees only B's songs | ☐ | ☐ | |
| 12 | Search A's song titles with B's link: nothing found | ☐ | ☐ | |
| 13 | "Make a new link": the old link stops working | ☐ | ☐ | |
| 14 | Disconnect OneDrive: the addon stops working | ☐ | ☐ | |

Quick checks without Eclipse (replace TOKEN):
```bash
curl https://<domain>/addon/TOKEN/manifest.json
curl "https://<domain>/addon/TOKEN/search?q=a"
curl https://<domain>/addon/TOKEN/stream/<track id from search>
curl -I -H "Range: bytes=0-1023" "<url from stream>"   # expect 206 Partial Content
```
