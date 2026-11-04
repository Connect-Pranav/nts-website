-- NTS Website 2.0 — initial schema (D1 / SQLite). Separate database from Ganesha.

-- Admin users and sessions
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','editor')),
  pass_hash TEXT NOT NULL,            -- PBKDF2-SHA256, "pbkdf2$iter$salt$hash"
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,           -- SHA-256 of the session token; raw token only lives in the cookie
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Rate limiting (login, contact form, public API)
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);

-- Social connections (one row per platform). Tokens are AES-GCM encrypted with TOKEN_ENC_KEY.
CREATE TABLE IF NOT EXISTS social_connections (
  platform TEXT PRIMARY KEY CHECK (platform IN ('linkedin','instagram','youtube')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','expired','revoked','error')),
  account_id TEXT,
  account_name TEXT,
  profile_url TEXT,
  scopes TEXT,                        -- space separated, as granted
  access_enc TEXT, access_iv TEXT,
  refresh_enc TEXT, refresh_iv TEXT,
  expires_at TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  verifier TEXT,                      -- PKCE verifier where used
  user_id TEXT,
  created_at TEXT NOT NULL
);

-- Social items synced from official APIs (never mock data)
CREATE TABLE IF NOT EXISTS social_items (
  id TEXT PRIMARY KEY,                -- platform:remote_id
  platform TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- video, reel, image, carousel, post, playlist
  title TEXT,
  caption TEXT,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  published_at TEXT,
  metrics TEXT,                       -- JSON of whatever the API returned
  featured INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_platform ON social_items(platform, published_at DESC);

-- Daily channel snapshots for growth charts
CREATE TABLE IF NOT EXISTS channel_snapshots (
  platform TEXT NOT NULL,
  day TEXT NOT NULL,
  followers INTEGER,
  views INTEGER,
  posts INTEGER,
  raw TEXT,
  PRIMARY KEY (platform, day)
);

-- CMS
CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,              -- home, about, lab, academy, insights, media, contact
  title TEXT NOT NULL,
  data TEXT NOT NULL,                 -- JSON blocks
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,             -- experiment, tool, case_study, exploration
  body TEXT,
  image_url TEXT,
  link_url TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  sort INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,                 -- markdown
  category TEXT NOT NULL,             -- article, tutorial, news, explainer
  tags TEXT,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published')),
  author TEXT,
  published_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_pub ON articles(status, published_at DESC);
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  track TEXT NOT NULL,                -- tutorial, exercise, career, workshop, institutional
  level TEXT,
  link_url TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  sort INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  kv_key TEXT NOT NULL,
  alt TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,               -- social links, featured video ids, contact email
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Content Studio: drafts -> variants -> publish jobs
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  title TEXT,
  body TEXT,                          -- master long-form markdown
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','archived')),
  article_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('linkedin','instagram','youtube','website')),
  text TEXT NOT NULL,
  media_url TEXT,                     -- public image/video URL (Instagram requires one)
  meta TEXT,                          -- JSON: title, tags, hashtags
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publish_jobs (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_approval'
    CHECK (status IN ('awaiting_approval','approved','rejected','publishing','published','failed','cancelled')),
  scheduled_at TEXT,                  -- NULL = publish as soon as approved
  approved_by TEXT,
  approved_at TEXT,
  remote_id TEXT,
  remote_url TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON publish_jobs(status, scheduled_at);

-- Agents
CREATE TABLE IF NOT EXISTS agent_state (
  agent_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed')),
  engine TEXT, model TEXT,
  input_tokens INTEGER, output_tokens INTEGER,
  cost_usd REAL,                      -- NULL unless a price is configured
  latency_ms INTEGER,
  ref TEXT,                           -- draft/job id
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON agent_runs(agent_id, created_at DESC);
CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  agent_run_id TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Contact enquiries
CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('partnership','institutional','collaboration','other')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  organisation TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','replied','closed','spam')),
  ip_hash TEXT,
  created_at TEXT NOT NULL
);

-- Privacy-conscious traffic: daily path counts, no cookies, no IPs stored
CREATE TABLE IF NOT EXISTS page_views (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
