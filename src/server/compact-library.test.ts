import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { D1, D1Stmt } from "./env";
import { itemToTrack, eclipseTrack, type TrackRow } from "./library";
import { pruneLibrary } from "./compact-library";
import { scanStep } from "./graph";
import { metadataStep } from "./metadata";
import { encryptString } from "./crypto";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllGlobals(); });

function database(compact = true) {
  const dir = mkdtempSync(join(tmpdir(), "compact-d1-"));
  dirs.push(dir);
  const path = join(dir, "db.sqlite");
  const execute = (payload: unknown): Record<string, unknown>[][] => JSON.parse(execFileSync("python3", ["src/test/d1-sqlite.py", path], { input: JSON.stringify(payload), encoding: "utf8" }));
  const script = (sql: string) => execute({ script: sql });
  for (const name of ["0001_init.sql", "0002_metadata.sql", "0003_small_storage.sql"]) script(readFileSync(`migrations/${name}`, "utf8"));
  script("INSERT INTO users(id,email,password_hash,created_at) VALUES('a','a@example.test','unused',0),('b','b@example.test','unused',0);");
  if (compact) script(readFileSync("migrations/0004_compact_library.sql", "utf8"));
  const db: D1 = {
    prepare: (sql: string) => {
      let values: unknown[] = [];
      const stmt: D1Stmt & { sql: string; values: () => unknown[] } = {
        sql, values: () => values,
        bind: (...args) => { values = args; return stmt; },
        all: async <T>() => ({ results: (execute({ statements: [{ sql, values }] })[0] ?? []) as T[] }),
        first: async <T>() => ((execute({ statements: [{ sql, values }] })[0] ?? [])[0] ?? null) as T | null,
        run: async () => execute({ statements: [{ sql, values }] }),
      };
      return stmt;
    },
    batch: async (statements) => execute({ statements: statements.map((stmt) => { const s = stmt as D1Stmt & { sql: string; values: () => unknown[] }; return { sql: s.sql, values: s.values() }; }) }),
  };
  return { db, script, execute };
}

function row(id = "one", artist = "Artist", album = "Album"): TrackRow {
  const result = itemToTrack({ id, name: `Song ${id}.mp3`, size: 4096, file: {}, audio: { title: `Song ${id}`, artist, album, track: 1, duration: 180_000 } });
  if (!result) throw new Error("Expected audio row");
  return result;
}

function insert(db: D1, owner: string, t: TrackRow) {
  return db.prepare(`INSERT INTO music_files(user_id,item_id,name,size,ext,title,artist,album,album_artist,artist_key,album_key,track_no,disc_no,genre,year,duration,modified_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(owner,t.item_id,t.name,t.size,t.ext,t.title,t.artist,t.album,t.album_artist,t.artist_key,t.album_key,t.track_no,t.disc_no,t.genre,t.year,t.duration,t.modified_at);
}

describe("compact shared library", () => {
  it("stores one artist and album for repeated names and keeps the Eclipse track response", async () => {
    const { db } = database();
    await db.batch([insert(db,"a",row("one")),insert(db,"a",row("two"))]);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM library_artists WHERE user_id=?").bind("a").first()).toEqual({ n: 1 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM library_albums WHERE user_id=?").bind("a").first()).toEqual({ n: 1 });
    const stored = await db.prepare("SELECT * FROM music_files WHERE user_id=? AND item_id=?").bind("a","one").first<TrackRow>();
    if (!stored) throw new Error("Missing stored track");
    expect(eclipseTrack(stored)).toEqual({ id: "one", title: "Song one", artist: "Artist", album: "Album", duration: 180, format: "mp3" });
    expect(stored.name).toBe("Song one.mp3");
    expect(await db.prepare("SELECT name FROM music_tracks WHERE user_id=? AND item_id=?").bind("a","one").first()).toEqual({ name: null });
  });

  it("separates identical names across owners and rejects forged cross-owner references", async () => {
    const { db } = database();
    await db.batch([insert(db,"a",row()),insert(db,"b",row("other","Private Artist","Private Album"))]);
    const a = await db.prepare("SELECT artist,album FROM music_files WHERE user_id=?").bind("a").all();
    expect(a.results).toEqual([{ artist: "Artist", album: "Album" }]);
    await expect(db.prepare("UPDATE music_tracks SET artist_id=999 WHERE user_id=?").bind("a").run()).rejects.toThrow();
    await db.batch([insert(db,"b",row("same"))]);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM library_artists WHERE name=?").bind("Artist").first()).toEqual({ n: 2 });
  });

  it("updates tagged names, preserves IDs and prunes only unreferenced owner records", async () => {
    const { db } = database();
    await db.batch([insert(db,"a",row()),insert(db,"b",row())]);
    await db.prepare("UPDATE music_files SET artist=?,album=?,album_artist=?,artist_key=?,album_key=?,tag_status=? WHERE user_id=? AND item_id=?")
      .bind("Tagged Artist","Tagged Album","Tagged Artist","ar-tagged-artist","al-tagged-artist|tagged-album","complete","a","one").run();
    await pruneLibrary(db,"a");
    expect(await db.prepare("SELECT artist,album,item_id,tag_status FROM music_files WHERE user_id=?").bind("a").first()).toEqual({ artist:"Tagged Artist",album:"Tagged Album",item_id:"one",tag_status:"complete" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM library_artists WHERE user_id=?").bind("a").first()).toEqual({ n:1 });
    expect(await db.prepare("SELECT artist FROM music_files WHERE user_id=?").bind("b").first()).toEqual({ artist:"Artist" });
    await db.prepare("DELETE FROM music_files WHERE user_id=?").bind("a").run();
    await pruneLibrary(db,"a");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM library_albums WHERE user_id=?").bind("a").first()).toEqual({ n:0 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM music_files WHERE user_id=?").bind("b").first()).toEqual({ n:1 });
  });

  it("resets only the old music index and sync cursor during migration, retaining accounts and connection links", async () => {
    const { db,script } = database(false);
    await insert(db,"a",row()).run();
    script("INSERT INTO microsoft_connections(user_id,ms_account_id,access_token_enc,refresh_token_enc,expires_at,created_at) VALUES('a','ms','encrypted','encrypted',0,0); INSERT INTO addon_tokens VALUES('hashed','a',0); INSERT INTO sync_state(user_id,next_link) VALUES('a','cursor');");
    script(readFileSync("migrations/0004_compact_library.sql","utf8"));
    expect(await db.prepare("SELECT COUNT(*) AS n FROM music_files").first()).toEqual({ n:0 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM sync_state").first()).toEqual({ n:0 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users").first()).toEqual({ n:2 });
    expect(await db.prepare("SELECT user_id FROM addon_tokens").first()).toEqual({ user_id:"a" });
    expect(await db.prepare("SELECT user_id FROM microsoft_connections").first()).toEqual({ user_id:"a" });
  });

  it("runs a real SQLite scan, metadata pass, retry and full rescan with owner-isolated readback", async () => {
    const { db } = database();
    const key=btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    const encrypted=await encryptString("test-token",key);
    await db.prepare("INSERT INTO microsoft_connections(user_id,ms_account_id,access_token_enc,refresh_token_enc,expires_at,created_at) VALUES(?,?,?,?,?,?)").bind("a","ms",encrypted,"unused",Date.now()+600_000,0).run();
    const env={ MS_CLIENT_ID:"test",MS_CLIENT_SECRET:"test",TOKEN_ENC_KEY:key };
    const bytes=new Uint8Array(4096);
    const text=new TextEncoder().encode("Tagged Song");
    bytes.set([73,68,51,3,0,0,0,0,0,11+text.length]);
    bytes.set(new TextEncoder().encode("TIT2"),10);
    new DataView(bytes.buffer).setUint32(14,text.length+1);
    bytes[20]=3;bytes.set(text,21);
    vi.stubGlobal("fetch",vi.fn(async (url:string,init:RequestInit) => {
      if(url.includes("/delta")) return Response.json({ value:[{ id:"one",name:"song.mp3",size:4096,file:{},audio:{artist:"Artist",album:"Album"} }],"@odata.deltaLink":"https://graph.microsoft.com/v1.0/me/drive/root/delta?next" });
      if(url.includes("/content")) return new Response(null,{status:302,headers:{location:"https://public.dm.files.1drv.com/song"}});
      const range=(init.headers as Record<string,string>)["Range"];
      const match=/bytes=(\d+)-(\d+)/.exec(range ?? "");
      if(!match) throw new Error("Range required");
      const start=Number(match[1]),end=Number(match[2]);
      return new Response(bytes.slice(start,end+1),{status:206,headers:{"content-range":`bytes ${start}-${end}/4096`}});
    }));
    await insert(db,"b",row("private")).run();
    expect(await scanStep(env,db,"a")).toMatchObject({ done:true,trackCount:1,changed:1 });
    expect(await metadataStep(env,db,"a")).toMatchObject({ done:true,tagged:1,unavailable:0 });
    expect(await db.prepare("SELECT title,artist,album FROM music_files WHERE user_id=? AND item_id=?").bind("a","one").first()).toEqual({ title:"Tagged Song",artist:"Artist",album:"Album" });
    await db.prepare("UPDATE music_tracks SET tag_status=2 WHERE user_id=?").bind("a").run();
    expect(await metadataStep(env,db,"a",false,true)).toMatchObject({ tagged:1,unavailable:0 });
    expect(await scanStep(env,db,"a",{full:true})).toMatchObject({done:true,trackCount:1});
    expect(await db.prepare("SELECT item_id FROM music_files WHERE user_id=?").bind("b").first()).toEqual({item_id:"private"});
  });

  it("uses less allocated SQLite space than the legacy layout for the same representative 2400 songs", async () => {
    const old=database(false),compact=database();
    const statements = Array.from({length:2400},(_,i)=>row(String(i),`Representative Artist ${Math.floor(i/60)}`,`Representative Album ${Math.floor(i/12)}`));
    await old.db.batch(statements.map(t=>insert(old.db,"a",t)));
    await compact.db.batch(statements.map(t=>insert(compact.db,"a",t)));
    const size=(execute: typeof old.execute) => {
      const pages=execute({statements:[{sql:"PRAGMA page_count"},{sql:"PRAGMA freelist_count"},{sql:"PRAGMA page_size"}]});
      return { allocated:Number(pages[0]?.[0]?.['page_count'])*Number(pages[2]?.[0]?.['page_size']),used:(Number(pages[0]?.[0]?.['page_count'])-Number(pages[1]?.[0]?.['freelist_count']))*Number(pages[2]?.[0]?.['page_size']) };
    };
    const before=size(old.execute),after=size(compact.execute);
    expect(after.allocated).toBeLessThan(before.allocated);
    expect(after.used).toBeLessThan(before.used);
    console.log("Synthetic 2400-song SQLite bytes (not owner D1):",{before,after});
  });
});