import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("small D1 storage migration", () => {
  it("preserves song details and excludes completed rows from metadata queue indexes", () => {
    const result = execFileSync("python3", ["-c", `
import sqlite3, pathlib, json
db = sqlite3.connect(':memory:')
for name in ['0001_init.sql', '0002_metadata.sql']:
    db.executescript(pathlib.Path('migrations', name).read_text())
db.execute("INSERT INTO users(id,email,password_hash,created_at) VALUES('owner','test@example.test','unused',0)")
for item, status in [('one','complete'),('two','pending'),('three','unavailable')]:
    db.execute("INSERT INTO music_files(user_id,item_id,name,path,mime,ext,title,artist,album,artist_key,album_key,tag_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", ('owner',item,'song.mp3','/Music/Artist/Album','audio/mpeg','mp3','Song','Artist','Album','ar-artist','al-artist|album',status))
db.executescript(pathlib.Path('migrations/0003_small_storage.sql').read_text())
print(json.dumps({'rows': db.execute('SELECT title,artist,album,path,mime,tag_status FROM music_files ORDER BY item_id').fetchall(), 'indexes': db.execute("SELECT name,sql FROM sqlite_master WHERE type='index' AND name LIKE 'idx_music_tags%'").fetchall(), 'pending': db.execute("EXPLAIN QUERY PLAN SELECT * FROM music_files WHERE user_id='owner' AND tag_status='pending' ORDER BY item_id LIMIT 3").fetchall()}))
`], { encoding: "utf8" });
    const data = JSON.parse(result) as { rows: unknown[][]; indexes: string[][]; pending: unknown[][] };
    expect(data.rows).toHaveLength(3);
    expect(data.rows.every((row) => row[0] === "Song" && row[1] === "Artist" && row[2] === "Album" && row[3] === null && row[4] === null)).toBe(true);
    expect(data.indexes.map((row) => row[0]).sort()).toEqual(["idx_music_tags_pending", "idx_music_tags_unavailable"]);
    expect(data.indexes.every((row) => row[1]?.includes("WHERE tag_status=") && !row[1]?.includes("complete"))).toBe(true);
    expect(JSON.stringify(data.pending)).toContain("idx_music_tags_pending");
  });
});