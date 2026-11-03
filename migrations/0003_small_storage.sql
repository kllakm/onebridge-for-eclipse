-- Apply once after 0002_metadata.sql. No music rows or song tags are removed.
-- These unused copies can be retrieved from OneDrive if ever needed.
UPDATE music_files SET path=NULL, mime=NULL;

-- Completed songs do not need to occupy the metadata work-queue index.
DROP INDEX IF EXISTS idx_music_tags;
CREATE INDEX idx_music_tags_pending ON music_files(user_id, item_id) WHERE tag_status='pending';
CREATE INDEX idx_music_tags_unavailable ON music_files(user_id, item_id) WHERE tag_status='unavailable';