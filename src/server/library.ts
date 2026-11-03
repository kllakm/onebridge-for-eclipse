// Pure helpers for turning OneDrive items into library rows and Eclipse JSON.
export const AUDIO_EXTS = ["mp3", "flac", "m4a", "aac", "wav", "ogg", "opus", "wma", "alac"];

export type DriveItem = {
  id: string;
  name?: string;
  size?: number;
  lastModifiedDateTime?: string;
  deleted?: unknown;
  folder?: unknown;
  file?: { mimeType?: string };
  parentReference?: { path?: string };
  audio?: {
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    track?: number;
    disc?: number;
    genre?: string;
    year?: number;
    duration?: number; // ms
  };
};

export type TrackRow = {
  item_id: string;
  name: string;
  path: string;
  size: number;
  ext: string;
  mime: string;
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  artist_key: string;
  album_key: string;
  track_no: number | null;
  disc_no: number | null;
  genre: string | null;
  year: number | null;
  duration: number | null; // seconds
  modified_at: string | null;
};

export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function keyOf(...parts: string[]) {
  return parts
    .map((p) => p.trim().toLowerCase())
    .join("|")
    .replace(/[^a-z0-9|]+/g, "-")
    .slice(0, 180);
}

/** Returns a row for audio files, or null for anything else. */
export function itemToTrack(item: DriveItem): TrackRow | null {
  if (!item.file || !item.name) return null;
  const ext = extOf(item.name);
  if (!AUDIO_EXTS.includes(ext)) return null;
  const a = item.audio ?? {};
  const base = item.name.slice(0, item.name.length - ext.length - 1);
  // Filename fallback "Artist - Title" only when tags are missing.
  const dash = base.split(" - ");
  const title = a.title?.trim() || (dash.length > 1 ? dash.slice(1).join(" - ") : base);
  const artist = a.artist?.trim() || (dash.length > 1 ? dash[0] : "Unknown Artist");
  const albumArtist = a.albumArtist?.trim() || artist;
  const album = a.album?.trim() || "Unknown Album";
  return {
    item_id: item.id,
    name: item.name,
    path: (item.parentReference?.path ?? "").replace(/^\/drive\/root:/, "") || "/",
    size: item.size ?? 0,
    ext,
    mime: item.file.mimeType ?? "",
    title,
    artist,
    album,
    album_artist: albumArtist,
    artist_key: "ar-" + keyOf(artist),
    album_key: "al-" + keyOf(albumArtist, album),
    track_no: a.track ?? null,
    disc_no: a.disc ?? null,
    genre: a.genre ?? null,
    year: a.year ?? null,
    duration: a.duration ? Math.round(a.duration / 1000) : null,
    modified_at: item.lastModifiedDateTime ?? null,
  };
}

export function eclipseTrack(r: Pick<TrackRow, "item_id" | "title" | "artist" | "album" | "duration" | "ext">) {
  return {
    id: r.item_id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    ...(r.duration ? { duration: r.duration } : {}),
    format: r.ext,
  };
}

/** Routing hints from the Eclipse /stream spec. Only set what the extension proves. */
export function streamHints(ext: string): Record<string, string> {
  switch (ext) {
    case "mp3":
      return { codec: "mp3", container: "mp3", manifest: "none" };
    case "flac":
      return { codec: "flac", container: "flac", manifest: "none" };
    case "wav":
      return { container: "wav", manifest: "none" };
    case "aac":
      return { codec: "aac", manifest: "none" };
    case "m4a":
    case "alac":
      return { container: "mp4", manifest: "none" }; // AAC or ALAC — unknown without probing
    case "ogg":
    case "opus":
      return { container: "ogg", manifest: "none" };
    default:
      return { manifest: "none" };
  }
}

export const ITEM_ID_RE = /^[A-Za-z0-9!_.-]{1,200}$/;
