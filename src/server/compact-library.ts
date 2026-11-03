import type { D1 } from "./env";

/** Cleanup only unreferenced shared names belonging to this owner. */
export async function pruneLibrary(db: D1, userId: string) {
  await db.batch([
    db.prepare(`DELETE FROM library_albums WHERE user_id=? AND NOT EXISTS
      (SELECT 1 FROM music_tracks t WHERE t.user_id=library_albums.user_id AND t.album_id=library_albums.id)`).bind(userId),
    db.prepare(`DELETE FROM library_artists WHERE user_id=? AND NOT EXISTS
      (SELECT 1 FROM music_tracks t WHERE t.user_id=library_artists.user_id AND t.artist_id=library_artists.id)
      AND NOT EXISTS (SELECT 1 FROM library_albums a WHERE a.user_id=library_artists.user_id AND a.album_artist_id=library_artists.id)`).bind(userId),
  ]);
}