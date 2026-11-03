import { createFileRoute } from "@tanstack/react-router";
import { addonHandler, preflight } from "@/server/addon";
import { json } from "@/server/http";
import { eclipseTrack } from "@/server/library";

export const Route = createFileRoute("/addon/$token/search")({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: ({ params, request }) =>
        addonHandler(params.token, async ({ db, userId }) => {
          const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 200);
          const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
          const where = "user_id = ? AND (title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR album LIKE ? ESCAPE '\\')";
          const tracks = await db
            .prepare(`SELECT item_id, title, artist, album, duration, ext FROM music_files WHERE ${where} ORDER BY artist, album, disc_no, track_no LIMIT 50`)
            .bind(userId, like, like, like)
            .all<{ item_id: string; title: string; artist: string; album: string; duration: number | null; ext: string }>();
          const albums = await db
            .prepare(
              `SELECT album_key AS id, album AS title, MAX(album_artist) AS artist, COUNT(*) AS trackCount, MAX(year) AS year
               FROM music_files WHERE user_id = ? AND (album LIKE ? ESCAPE '\\' OR album_artist LIKE ? ESCAPE '\\')
               GROUP BY album_key ORDER BY title LIMIT 20`,
            )
            .bind(userId, like, like)
            .all<{ id: string; title: string; artist: string; trackCount: number; year: number | null }>();
          const artists = await db
            .prepare(
              `SELECT artist_key AS id, MAX(artist) AS name, GROUP_CONCAT(DISTINCT genre) AS genres
               FROM music_files WHERE user_id = ? AND artist LIKE ? ESCAPE '\\' GROUP BY artist_key ORDER BY name LIMIT 20`,
            )
            .bind(userId, like)
            .all<{ id: string; name: string; genres: string | null }>();
          return json({
            tracks: tracks.results.map(eclipseTrack),
            albums: albums.results.map((a) => ({ ...a, year: a.year ? String(a.year) : undefined })),
            artists: artists.results.map((a) => ({ id: a.id, name: a.name, genres: a.genres ? a.genres.split(",") : [] })),
          });
        }),
    },
  },
});
