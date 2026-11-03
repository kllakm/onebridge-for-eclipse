import { parseFromTokenizer, type IAudioMetadata } from "music-metadata";
import { RangeTokenizer } from "./range-tokenizer";
import { keyOf, type TrackRow } from "./library";
import type { AppEnv, D1 } from "./env";
import { downloadUrl } from "./graph";

export function mergeTags(row: TrackRow, metadata: IAudioMetadata): TrackRow {
  const c = metadata.common;
  const artist = c.artist?.trim() || row.artist;
  const album = c.album?.trim() || row.album;
  const albumArtist = c.albumartist?.trim() || (row.album_artist === "Unknown Artist" ? artist : row.album_artist);
  return {
    ...row,
    title: c.title?.trim() || row.title,
    artist, album, album_artist: albumArtist,
    artist_key: "ar-" + keyOf(artist), album_key: "al-" + keyOf(albumArtist, album),
    track_no: c.track.no ?? row.track_no, disc_no: c.disk.no ?? row.disc_no,
    genre: c.genre?.join(", ") || row.genre, year: c.year ?? row.year,
    duration: metadata.format.duration ? Math.round(metadata.format.duration) : row.duration,
  };
}

export async function readEmbeddedTags(url: string, size: number, name: string) {
  const tokenizer = new RangeTokenizer(url, size, name);
  const timeout = setTimeout(() => { void tokenizer.close(); }, 15_000);
  try {
    return await parseFromTokenizer(tokenizer, { skipCovers: true, duration: false });
  } finally {
    clearTimeout(timeout);
    await tokenizer.close();
  }
}

/** Three files per request keeps range and Graph calls within the Free Worker budget. */
export async function metadataStep(env: AppEnv, db: D1, userId: string) {
  const rows = await db.prepare("SELECT * FROM music_files WHERE user_id=? AND tag_status='pending' ORDER BY item_id LIMIT 3")
    .bind(userId).all<TrackRow>();
  for (const row of rows.results) {
    try {
      const url = await downloadUrl(env, db, userId, row.item_id);
      const metadata = await readEmbeddedTags(url, row.size, row.name);
      const t = mergeTags(row, metadata);
      const status = Object.keys(metadata.native).length ? "complete" : "unavailable";
      await db.prepare(`UPDATE music_files SET title=?, artist=?, album=?, album_artist=?, artist_key=?, album_key=?,
        track_no=?, disc_no=?, genre=?, year=?, duration=?, tag_status=? WHERE user_id=? AND item_id=?`)
        .bind(t.title, t.artist, t.album, t.album_artist, t.artist_key, t.album_key, t.track_no, t.disc_no,
          t.genre, t.year, t.duration, status, userId, row.item_id).run();
    } catch {
      // Never log the signed download URL or parser errors that may contain it.
      await db.prepare("UPDATE music_files SET tag_status='unavailable' WHERE user_id=? AND item_id=?")
        .bind(userId, row.item_id).run();
    }
  }
  const counts = await db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN tag_status!='pending' THEN 1 ELSE 0 END) AS processed,
    SUM(CASE WHEN tag_status='complete' THEN 1 ELSE 0 END) AS tagged,
    SUM(CASE WHEN tag_status='unavailable' THEN 1 ELSE 0 END) AS unavailable
    FROM music_files WHERE user_id=?`).bind(userId).first<{ total: number; processed: number; tagged: number; unavailable: number }>();
  const total = counts?.total ?? 0;
  const processed = counts?.processed ?? 0;
  return { done: total === processed, total, processed, tagged: counts?.tagged ?? 0, unavailable: counts?.unavailable ?? 0 };
}