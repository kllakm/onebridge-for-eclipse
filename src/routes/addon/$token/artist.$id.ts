import { createFileRoute } from "@tanstack/react-router";
import { addonHandler, preflight } from "@/server/addon";
import { json } from "@/server/http";
import { eclipseTrack } from "@/server/library";

export const Route = createFileRoute("/addon/$token/artist/$id")({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: ({ params }) =>
        addonHandler(params.token, async ({ db, userId }) => {
          const tracks = await db
            .prepare("SELECT item_id, title, artist, album, duration, ext FROM music_files WHERE user_id=? AND artist_key=? ORDER BY album, disc_no, track_no LIMIT 50")
            .bind(userId, params.id)
            .all<{ item_id: string; title: string; artist: string; album: string; duration: number | null; ext: string }>();
          if (!tracks.results.length) return json({ error: "Artist not found" }, 404);
          const albums = await db
            .prepare(
              "SELECT album_key AS id, album AS title, MAX(album_artist) AS artist, COUNT(*) AS trackCount, MAX(year) AS year FROM music_files WHERE user_id=? AND artist_key=? GROUP BY album_key ORDER BY year",
            )
            .bind(userId, params.id)
            .all<{ id: string; title: string; artist: string; trackCount: number; year: number | null }>();
          return json({
            id: params.id,
            name: tracks.results[0].artist,
            topTracks: tracks.results.map(eclipseTrack),
            albums: albums.results.map((a) => ({ ...a, year: a.year ? String(a.year) : undefined })),
          });
        }),
    },
  },
});
