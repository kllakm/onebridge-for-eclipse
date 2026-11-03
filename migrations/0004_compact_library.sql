-- DESTRUCTIVE TO THE MUSIC INDEX ONLY: user-approved reset for a fresh scan.
-- Retains accounts, sessions, Microsoft connections and existing addon links.
-- Apply with all scan/tag activity stopped, after migrations 0001 through 0003.
DROP TABLE music_files;
DELETE FROM sync_state;

CREATE TABLE library_artists (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id INTEGER NOT NULL,
  name TEXT NOT NULL,
  artist_key TEXT NOT NULL,
  PRIMARY KEY(user_id, id),
  UNIQUE(user_id, name)
) WITHOUT ROWID;
CREATE INDEX library_artist_keys ON library_artists(user_id, artist_key);

CREATE TABLE library_albums (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id INTEGER NOT NULL,
  title TEXT NOT NULL,
  album_artist_id INTEGER NOT NULL,
  album_key TEXT NOT NULL,
  PRIMARY KEY(user_id, id),
  UNIQUE(user_id, title, album_artist_id),
  FOREIGN KEY(user_id, album_artist_id) REFERENCES library_artists(user_id, id)
) WITHOUT ROWID;
CREATE INDEX library_album_keys ON library_albums(user_id, album_key);

CREATE TABLE music_tracks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  name TEXT,
  size INTEGER,
  ext TEXT NOT NULL,
  title TEXT NOT NULL,
  artist_id INTEGER NOT NULL,
  album_id INTEGER NOT NULL,
  track_no INTEGER,
  disc_no INTEGER,
  genre TEXT,
  year INTEGER,
  duration INTEGER,
  modified_at TEXT,
  tag_status INTEGER NOT NULL DEFAULT 0 CHECK(tag_status IN (0,1,2)),
  PRIMARY KEY(user_id, item_id),
  FOREIGN KEY(user_id, artist_id) REFERENCES library_artists(user_id, id),
  FOREIGN KEY(user_id, album_id) REFERENCES library_albums(user_id, id)
) WITHOUT ROWID;
CREATE INDEX compact_music_album ON music_tracks(user_id, album_id);
CREATE INDEX compact_music_artist ON music_tracks(user_id, artist_id);
CREATE INDEX compact_tags_pending ON music_tracks(user_id, item_id) WHERE tag_status=0;
CREATE INDEX compact_tags_unavailable ON music_tracks(user_id, item_id) WHERE tag_status=2;

-- A view has no stored rows: Eclipse receives the same names and stable IDs.
CREATE VIEW music_files AS
SELECT t.user_id, t.item_id, COALESCE(t.name,t.title||'.'||t.ext) AS name,
  NULL AS path, t.size, t.ext, NULL AS mime, t.title, ar.name AS artist,
  al.title AS album, aa.name AS album_artist, ar.artist_key, al.album_key,
  t.track_no,t.disc_no,t.genre,t.year,t.duration,t.modified_at,
  CASE t.tag_status WHEN 1 THEN 'complete' WHEN 2 THEN 'unavailable' ELSE 'pending' END AS tag_status
FROM music_tracks t
JOIN library_artists ar ON ar.user_id=t.user_id AND ar.id=t.artist_id
JOIN library_albums al ON al.user_id=t.user_id AND al.id=t.album_id
JOIN library_artists aa ON aa.user_id=al.user_id AND aa.id=al.album_artist_id;

-- Preserve existing batched scan/tag writers; references are resolved only within NEW.user_id.
CREATE TRIGGER music_files_insert INSTEAD OF INSERT ON music_files BEGIN
  INSERT INTO library_artists(user_id,id,name,artist_key)
    SELECT NEW.user_id,COALESCE(MAX(id),0)+1,NEW.artist,NEW.artist_key FROM library_artists WHERE user_id=NEW.user_id
    ON CONFLICT(user_id,name) DO UPDATE SET artist_key=excluded.artist_key;
  INSERT OR IGNORE INTO library_artists(user_id,id,name,artist_key)
    SELECT NEW.user_id,COALESCE(MAX(id),0)+1,COALESCE(NEW.album_artist,NEW.artist),
      CASE WHEN COALESCE(NEW.album_artist,NEW.artist)=NEW.artist THEN NEW.artist_key ELSE 'ar-'||COALESCE(NEW.album_artist,NEW.artist) END
    FROM library_artists WHERE user_id=NEW.user_id;
  INSERT OR IGNORE INTO library_albums(user_id,id,title,album_artist_id,album_key)
    SELECT NEW.user_id,COALESCE(MAX(id),0)+1,NEW.album,
      (SELECT id FROM library_artists WHERE user_id=NEW.user_id AND name=COALESCE(NEW.album_artist,NEW.artist)),NEW.album_key
    FROM library_albums WHERE user_id=NEW.user_id;
  INSERT INTO music_tracks(user_id,item_id,name,size,ext,title,artist_id,album_id,track_no,disc_no,genre,year,duration,modified_at,tag_status)
    VALUES(NEW.user_id,NEW.item_id,CASE WHEN NEW.name=NEW.title||'.'||NEW.ext THEN NULL ELSE NEW.name END,
      NEW.size,NEW.ext,NEW.title,
      (SELECT id FROM library_artists WHERE user_id=NEW.user_id AND name=NEW.artist),
      (SELECT id FROM library_albums WHERE user_id=NEW.user_id AND title=NEW.album AND album_artist_id=(SELECT id FROM library_artists WHERE user_id=NEW.user_id AND name=COALESCE(NEW.album_artist,NEW.artist))),
      NEW.track_no,NEW.disc_no,NEW.genre,NEW.year,NEW.duration,NEW.modified_at,
      CASE NEW.tag_status WHEN 'complete' THEN 1 WHEN 'unavailable' THEN 2 ELSE 0 END)
    ON CONFLICT(user_id,item_id) DO UPDATE SET name=excluded.name,size=excluded.size,ext=excluded.ext,title=excluded.title,
      artist_id=excluded.artist_id,album_id=excluded.album_id,track_no=excluded.track_no,disc_no=excluded.disc_no,
      genre=excluded.genre,year=excluded.year,duration=excluded.duration,modified_at=excluded.modified_at,tag_status=excluded.tag_status;
END;

CREATE TRIGGER music_files_update INSTEAD OF UPDATE ON music_files
WHEN NEW.user_id=OLD.user_id AND NEW.item_id=OLD.item_id BEGIN
  INSERT INTO library_artists(user_id,id,name,artist_key)
    SELECT NEW.user_id,COALESCE(MAX(id),0)+1,NEW.artist,NEW.artist_key FROM library_artists WHERE user_id=NEW.user_id
    ON CONFLICT(user_id,name) DO UPDATE SET artist_key=excluded.artist_key;
  INSERT OR IGNORE INTO library_artists(user_id,id,name,artist_key)
    SELECT NEW.user_id,COALESCE(MAX(id),0)+1,COALESCE(NEW.album_artist,NEW.artist),
      CASE WHEN COALESCE(NEW.album_artist,NEW.artist)=NEW.artist THEN NEW.artist_key ELSE 'ar-'||COALESCE(NEW.album_artist,NEW.artist) END
    FROM library_artists WHERE user_id=NEW.user_id;
  INSERT OR IGNORE INTO library_albums(user_id,id,title,album_artist_id,album_key)
    SELECT NEW.user_id,COALESCE(MAX(id),0)+1,NEW.album,
      (SELECT id FROM library_artists WHERE user_id=NEW.user_id AND name=COALESCE(NEW.album_artist,NEW.artist)),NEW.album_key
    FROM library_albums WHERE user_id=NEW.user_id;
  UPDATE music_tracks SET name=CASE WHEN NEW.name=NEW.title||'.'||NEW.ext THEN NULL ELSE NEW.name END,
    title=NEW.title,artist_id=(SELECT id FROM library_artists WHERE user_id=NEW.user_id AND name=NEW.artist),
    album_id=(SELECT id FROM library_albums WHERE user_id=NEW.user_id AND title=NEW.album AND album_artist_id=(SELECT id FROM library_artists WHERE user_id=NEW.user_id AND name=COALESCE(NEW.album_artist,NEW.artist))),
    track_no=NEW.track_no,disc_no=NEW.disc_no,genre=NEW.genre,year=NEW.year,duration=NEW.duration,
    tag_status=CASE NEW.tag_status WHEN 'complete' THEN 1 WHEN 'unavailable' THEN 2 ELSE 0 END
    WHERE user_id=OLD.user_id AND item_id=OLD.item_id;
END;

CREATE TRIGGER music_files_delete INSTEAD OF DELETE ON music_files BEGIN
  DELETE FROM music_tracks WHERE user_id=OLD.user_id AND item_id=OLD.item_id;
END;