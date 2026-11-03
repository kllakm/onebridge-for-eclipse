import { createFileRoute } from "@tanstack/react-router";
import { addonHandler, preflight } from "@/server/addon";
import { json } from "@/server/http";
import { eclipseTrack } from "@/server/library";

export const Route = createFileRoute("/addon/$token/album/$id")({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: ({ params }) =>
        addonHandler(params.token, async ({ db, userId }) => {
          const rows = await db
            .prepare(
              "SELECT item_id, title, artist, album, album_artist, duration, ext, year FROM music_files WHERE user_id=? AND album_key=? ORDER BY disc_no, track_no, title",
            )
            .bind(userId, params.id)
            .all<{ item_id: string; title: string; artist: string; album: string; album_artist: string; duration: number | null; ext: string; year: number | null }>();
          const first = rows.results[0];
          if (!first) return json({ error: "Album not found" }, 404);
          return json({
            id: params.id,
            title: first.album,
            artist: first.album_artist,
            ...(first.year ? { year: String(first.year) } : {}),
            trackCount: rows.results.length,
            tracks: rows.results.map(eclipseTrack),
          });
        }),
    },
  },
});
