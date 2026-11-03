import { AbstractTokenizer, EndOfStreamError, type IReadChunkOptions } from "strtok3/core";

export const TAG_BYTE_LIMIT = 512 * 1024;
export const TAG_REQUEST_LIMIT = 8;
const CHUNK_SIZE = 64 * 1024;

/** Random-access metadata reads; skipping audio payloads never fetches them. */
export class RangeTokenizer extends AbstractTokenizer {
  fileInfo: { size: number; path: string };
  private chunks = new Map<number, Uint8Array>();
  private requests = 0;
  private bytes = 0;
  private controller = new AbortController();

  constructor(private url: string, size: number, name: string) {
    super({ maxBufferSize: TAG_BYTE_LIMIT });
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error("Unknown music file size");
    this.fileInfo = { size, path: name };
  }

  supportsRandomAccess() { return true; }
  setPosition(position: number) {
    this.validateLength(position, "position");
    this.position = position;
  }

  async readBuffer(buffer: Uint8Array, options?: IReadChunkOptions) {
    const normalized = this.normalizeOptions(buffer, options);
    const n = await this.peekBuffer(buffer, normalized);
    this.position = normalized.position + n;
    return n;
  }

  async peekBuffer(buffer: Uint8Array, options?: IReadChunkOptions) {
    const o = this.normalizeOptions(buffer, options);
    if (o.length > TAG_BYTE_LIMIT) throw new Error("Music tag exceeds read budget");
    const length = Math.max(0, Math.min(o.length, this.fileInfo.size - o.position));
    if (length < o.length && !o.mayBeLess) throw new EndOfStreamError();
    let copied = 0;
    while (copied < length) {
      const position = o.position + copied;
      const start = Math.floor(position / CHUNK_SIZE) * CHUNK_SIZE;
      const chunk = await this.chunk(start);
      const offset = position - start;
      const n = Math.min(length - copied, chunk.length - offset);
      if (n <= 0) throw new EndOfStreamError();
      buffer.set(chunk.subarray(offset, offset + n), copied);
      copied += n;
    }
    return copied;
  }

  private async chunk(start: number) {
    const cached = this.chunks.get(start);
    if (cached) return cached;
    const end = Math.min(start + CHUNK_SIZE, this.fileInfo.size) - 1;
    const length = end - start + 1;
    if (this.requests >= TAG_REQUEST_LIMIT || this.bytes + length > TAG_BYTE_LIMIT) throw new Error("Music tag read budget reached");
    this.requests++;
    const response = await fetch(this.url, {
      headers: { Range: `bytes=${start}-${end}` },
      redirect: "error",
      signal: this.controller.signal,
    });
    const range = response.headers.get("content-range");
    if (response.status !== 206 || range !== `bytes ${start}-${end}/${this.fileInfo.size}` || !response.body) {
      if (response.body) await response.body.cancel();
      throw new Error("Music host did not return the requested byte range");
    }
    const reader = response.body.getReader();
    const result = new Uint8Array(length);
    let received = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        this.bytes += value.length;
        if (received + value.length > length || this.bytes > TAG_BYTE_LIMIT) throw new Error("Music host exceeded byte range");
        result.set(value, received);
        received += value.length;
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    if (received !== length) throw new EndOfStreamError();
    this.chunks.set(start, result);
    return result;
  }

  override async close() {
    this.controller.abort();
    this.chunks.clear();
    await super.close();
  }
}