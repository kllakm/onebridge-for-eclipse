import { parseFromTokenizer, type IAudioMetadata } from "music-metadata";
import { RangeTokenizer, TagDownloadError, TAG_TIMEOUT_MS } from "./range-tokenizer";
import { keyOf, type TrackRow } from "./library";
import type { AppEnv, D1 } from "./env";
import { metadataDownloader } from "./graph";
import { readSelectiveMp3Tags } from "./mp3-tags";
import { HttpError } from "./http";

export function tagFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof TagDownloadError) return error.message;
  if (error instanceof HttpError) return `OneDrive request failed (${error.status})`;
  if (message.includes("requested byte range")) return "Music host rejected the requested byte range";
  if (message.includes("budget") || message.includes("Buffer size")) return "Tags exceed the safe read limit";
  if (message.includes("Unknown music file size")) return "Indexed file size is missing";
  if (message.includes("byte range")) return "Music host returned an invalid byte range";
  if (message.includes("not implemented")) return "Tag reader used an unsupported server feature";
  if (message.includes("fetch") || message.includes("redirect")) return "Music download request failed or redirected";
  if (message.includes("abort") || message.includes("Abort")) return "Tag reading timed out";
  return "Tag parser could not read this file";
}

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
  const mp3 = /\.mp3$/i.test(name);
  const tokenizer = new RangeTokenizer(url, size, name);
  const timeout = setTimeout(() => { void tokenizer.close(); }, TAG_TIMEOUT_MS);
  try {
    if (mp3) {
      const tags = await readSelectiveMp3Tags(tokenizer);
      if (tags) return tags;
    }
    return await parseFromTokenizer(tokenizer, { skipCovers: true, duration: false });
  } finally {
    clearTimeout(timeout);
    await tokenizer.close();
  }
}

/** Three files per request keeps range and Graph calls within the Free Worker budget. */
export async function metadataStep(env: AppEnv, db: D1, userId: string, diagnose = false, retryFailed = false) {
  const issues: string[] = [];
  if (retryFailed && !diagnose) await db.prepare("UPDATE music_files SET tag_status='pending' WHERE user_id=? AND tag_status='unavailable'").bind(userId).run();
  const rows = await db.prepare(diagnose
    ? "SELECT * FROM music_files WHERE user_id=? AND tag_status='unavailable' ORDER BY item_id LIMIT 1"
    : "SELECT * FROM music_files WHERE user_id=? AND tag_status='pending' ORDER BY item_id LIMIT 3")
    .bind(userId).all<TrackRow>();
  const downloader = rows.results.length ? await metadataDownloader(env, db, userId) : null;
  await Promise.all(rows.results.map(async (row) => {
    if (!downloader) return;
    let stage = "Download link";
    try {
      const url = await downloader(row.item_id);
      stage = "Embedded tags";
      const metadata = await readEmbeddedTags(url, row.size, row.name);
      const t = mergeTags(row, metadata);
      const status = Object.keys(metadata.native).length ? "complete" : "unavailable";
      if (status === "unavailable") issues.push(`${row.ext.toUpperCase()}: no embedded tags returned`);
      await db.prepare(`UPDATE music_files SET title=?, artist=?, album=?, album_artist=?, artist_key=?, album_key=?,
        track_no=?, disc_no=?, genre=?, year=?, duration=?, tag_status=? WHERE user_id=? AND item_id=?`)
        .bind(t.title, t.artist, t.album, t.album_artist, t.artist_key, t.album_key, t.track_no, t.disc_no,
          t.genre, t.year, t.duration, status, userId, row.item_id).run();
    } catch (error) {
      issues.push(`${row.ext.toUpperCase()} · ${stage}: ${tagFailure(error)}`);
      // Never log the signed download URL or parser errors that may contain it.
      if (!diagnose) await db.prepare("UPDATE music_files SET tag_status='unavailable' WHERE user_id=? AND item_id=?")
        .bind(userId, row.item_id).run();
    }
  }));
  const counts = await db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN tag_status!='pending' THEN 1 ELSE 0 END) AS processed,
    SUM(CASE WHEN tag_status='complete' THEN 1 ELSE 0 END) AS tagged,
    SUM(CASE WHEN tag_status='unavailable' THEN 1 ELSE 0 END) AS unavailable
    FROM music_files WHERE user_id=?`).bind(userId).first<{ total: number; processed: number; tagged: number; unavailable: number }>();
  const total = counts?.total ?? 0;
  const processed = counts?.processed ?? 0;
  return { done: total === processed, total, processed, tagged: counts?.tagged ?? 0, unavailable: counts?.unavailable ?? 0, issues };
}