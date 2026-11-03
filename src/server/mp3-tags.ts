import { parseBuffer, type IAudioMetadata } from "music-metadata";
import { RangeTokenizer, TAG_BYTE_LIMIT } from "./range-tokenizer";

const TEXT_FRAME = /^T[A-Z0-9]{3}$/;
const MAX_FRAMES = 512;
const decoder = new TextDecoder("latin1");

function syncSafe(bytes: Uint8Array, offset: number) {
  const values = bytes.subarray(offset, offset + 4);
  if (values.length !== 4 || values.some((value) => value > 127)) throw new Error("Invalid ID3 size");
  return values.reduce((total, value) => total * 128 + value, 0);
}

function uint32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

async function readAt(reader: RangeTokenizer, position: number, length: number) {
  const bytes = new Uint8Array(length);
  await reader.peekBuffer(bytes, { position });
  return bytes;
}

/** Keep proven music-metadata decoding; only compact ordinary ID3v2.3/2.4 text frames.
 * Picture and padding bodies are jumped over without fetching their contents.
 * Older/unsynchronised layouts use the original bounded parser instead.
 */
export async function readSelectiveMp3Tags(reader: RangeTokenizer): Promise<IAudioMetadata | null> {
  if (reader.fileInfo.size < 10) return null;
  const header = await readAt(reader, 0, 10);
  const version = header[3];
  const flags = header[5] ?? 0;
  if (decoder.decode(header.subarray(0, 3)) !== "ID3" || (version !== 3 && version !== 4) || (flags & 0x80)) return null;
  const end = 10 + syncSafe(header, 6);
  if (end > reader.fileInfo.size) throw new Error("Invalid ID3 boundary");
  let position = 10;
  if (flags & 0x40) {
    const extension = await readAt(reader, position, 4);
    const length = version === 4 ? syncSafe(extension, 0) : uint32(extension, 0) + 4;
    if (length < (version === 4 ? 6 : 10) || position + length > end) throw new Error("Invalid ID3 extended header");
    position += length;
  }
  const frames: Uint8Array[] = [];
  let kept = 0;
  let count = 0;
  while (position + 10 <= end) {
    if (++count > MAX_FRAMES) throw new Error("Music tag frame budget reached");
    const frame = await readAt(reader, position, 10);
    if (frame[0] === 0) break; // Padding: do not download the padding block.
    const id = decoder.decode(frame.subarray(0, 4));
    if (!/^[A-Z0-9]{4}$/.test(id)) throw new Error("Invalid ID3 frame");
    const size = version === 4 ? syncSafe(frame, 4) : uint32(frame, 4);
    if (position + 10 + size > end) throw new Error("Invalid ID3 frame boundary");
    if (TEXT_FRAME.test(id) && size > 0) {
      if (kept + 10 + size > TAG_BYTE_LIMIT - 10) throw new Error("Music text tag byte budget reached");
      const body = await readAt(reader, position + 10, size);
      const compact = new Uint8Array(10 + size);
      compact.set(frame);
      compact.set(body, 10);
      frames.push(compact);
      kept += compact.length;
    }
    position += 10 + size;
  }
  const compact = new Uint8Array(10 + kept);
  compact.set(header);
  compact[5] = 0; // Extended header/footer were removed; whole-tag unsync was excluded.
  compact.set([(kept >>> 21) & 127, (kept >>> 14) & 127, (kept >>> 7) & 127, kept & 127], 6);
  let offset = 10;
  for (const frame of frames) { compact.set(frame, offset); offset += frame.length; }
  // If there are no usable text frames, retain the old parser's ID3v1/other-tag fallback.
  if (!frames.length) return null;
  return parseBuffer(compact, { mimeType: "audio/mpeg", path: reader.fileInfo.path }, { skipCovers: true, duration: false, skipPostHeaders: true });
}