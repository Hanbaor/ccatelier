PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1), views INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0, applause INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO site_stats(id) VALUES (1);
CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, first_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS page_stats (page TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0, applause INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS visits (
  visitor_id TEXT NOT NULL, page TEXT NOT NULL, window INTEGER NOT NULL,
  PRIMARY KEY(visitor_id,page,window)
);
CREATE TABLE IF NOT EXISTS reactions (visitor_id TEXT NOT NULL, page TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(visitor_id,page));
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, page TEXT NOT NULL, visitor_id TEXT NOT NULL,
  submission_id TEXT NOT NULL, nickname TEXT NOT NULL, message TEXT NOT NULL,
  stamp TEXT NOT NULL CHECK(stamp IN ('star','drum','ticket','ribbon')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reply TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, moderated_at INTEGER,
  UNIQUE(visitor_id,submission_id)
);
CREATE INDEX IF NOT EXISTS comments_public ON comments(page,status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS comments_moderation ON comments(status,created_at DESC);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_expiry ON rate_limits(expires);

CREATE TRIGGER IF NOT EXISTS count_visitor AFTER INSERT ON visitors BEGIN
  UPDATE site_stats SET visitors=visitors+1 WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS count_view AFTER INSERT ON visits BEGIN
  UPDATE site_stats SET views=views+1 WHERE id=1;
  INSERT INTO page_stats(page,views) VALUES (NEW.page,1)
    ON CONFLICT(page) DO UPDATE SET views=views+1;
END;
CREATE TRIGGER IF NOT EXISTS count_applause AFTER INSERT ON reactions BEGIN
  UPDATE site_stats SET applause=applause+1 WHERE id=1;
  INSERT INTO page_stats(page,applause) VALUES (NEW.page,1)
    ON CONFLICT(page) DO UPDATE SET applause=applause+1;
END;
