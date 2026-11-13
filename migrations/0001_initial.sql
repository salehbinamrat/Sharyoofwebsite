CREATE TABLE IF NOT EXISTS items (
 id TEXT PRIMARY KEY,
 type TEXT NOT NULL CHECK (type IN ('program','hotspot','video')),
 slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT '',
 cover TEXT NOT NULL DEFAULT '',
 payload TEXT NOT NULL DEFAULT '{}',
 published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_items_public ON items (published,type,updated_at);
CREATE TABLE IF NOT EXISTS site_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 title TEXT NOT NULL DEFAULT 'بوابة شريوف',
 tagline TEXT NOT NULL DEFAULT 'البرامج وصفحات الهوتسبوت والشروحات',
 contact TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO site_settings (id,title,tagline,contact)
 VALUES (1,'بوابة شريوف','البرامج وصفحات الهوتسبوت والشروحات','');
CREATE TABLE IF NOT EXISTS login_attempts (
 ip TEXT PRIMARY KEY,
 failures INTEGER NOT NULL DEFAULT 0,
 window_start INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS images (
 id TEXT PRIMARY KEY,
 mime TEXT NOT NULL,
 data BLOB NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
