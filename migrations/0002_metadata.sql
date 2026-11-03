-- Run once after 0001_init.sql. Existing rows are queued for embedded-tag reading.
ALTER TABLE music_files ADD COLUMN tag_status TEXT NOT NULL DEFAULT 'pending';
CREATE INDEX idx_music_tags ON music_files(user_id, tag_status, item_id);