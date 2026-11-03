-- Requires completed 0004. Stop scanning/tagging and back up before applying.
-- Non-destructive: backfill once, then keep counts transactional with track changes.
CREATE TABLE IF NOT EXISTS library_progress (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total INTEGER NOT NULL DEFAULT 0,
  tagged INTEGER NOT NULL DEFAULT 0,
  unavailable INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

INSERT INTO library_progress(user_id,total,tagged,unavailable)
SELECT user_id,COUNT(*),SUM(tag_status=1),SUM(tag_status=2)
FROM music_tracks GROUP BY user_id
ON CONFLICT(user_id) DO UPDATE SET total=excluded.total,tagged=excluded.tagged,unavailable=excluded.unavailable;

CREATE TRIGGER IF NOT EXISTS library_progress_insert AFTER INSERT ON music_tracks BEGIN
  INSERT INTO library_progress(user_id,total,tagged,unavailable)
  VALUES(NEW.user_id,1,NEW.tag_status=1,NEW.tag_status=2)
  ON CONFLICT(user_id) DO UPDATE SET total=total+1,tagged=tagged+(NEW.tag_status=1),unavailable=unavailable+(NEW.tag_status=2);
END;

CREATE TRIGGER IF NOT EXISTS library_progress_update AFTER UPDATE OF tag_status ON music_tracks
WHEN NEW.tag_status!=OLD.tag_status BEGIN
  UPDATE library_progress SET tagged=tagged+(NEW.tag_status=1)-(OLD.tag_status=1),
    unavailable=unavailable+(NEW.tag_status=2)-(OLD.tag_status=2) WHERE user_id=NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS library_progress_delete AFTER DELETE ON music_tracks BEGIN
  UPDATE library_progress SET total=total-1,tagged=tagged-(OLD.tag_status=1),
    unavailable=unavailable-(OLD.tag_status=2) WHERE user_id=OLD.user_id;
END;