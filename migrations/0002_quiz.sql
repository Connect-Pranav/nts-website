-- NTS LinkedIn Quiz Campaign schema (migration 0002)

CREATE TABLE IF NOT EXISTS linkedin_quiz_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  publishing_time TEXT NOT NULL DEFAULT '13:30',
  comment_delay_hours INTEGER NOT NULL DEFAULT 24,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','completed')),
  mode TEXT NOT NULL DEFAULT 'approval' CHECK (mode IN ('approval','autonomous')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS linkedin_quiz_posts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES linkedin_quiz_campaigns(id),
  day_number INTEGER NOT NULL,
  scheduled_at TEXT NOT NULL,         -- UTC ISO-8601, corresponds to 01:30 PM IST (08:00 UTC)
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  hook TEXT NOT NULL,
  scenario TEXT NOT NULL,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer TEXT NOT NULL,       -- 'A', 'B', 'C', or 'D'
  post_content TEXT NOT NULL,         -- full ready-to-publish LinkedIn post text
  answer_comment TEXT NOT NULL,       -- full answer reveal comment text
  hashtags TEXT NOT NULL,
  quality_score INTEGER NOT NULL DEFAULT 90,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected')),
  publishing_status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (publishing_status IN ('scheduled','published','failed','skipped')),
  linkedin_post_id TEXT,              -- URN returned by LinkedIn after publish
  linkedin_post_url TEXT,
  work_item_id TEXT,                  -- matching KV work board item id
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(campaign_id, day_number)
);
CREATE INDEX IF NOT EXISTS idx_quiz_posts_scheduled ON linkedin_quiz_posts(scheduled_at, publishing_status);
CREATE INDEX IF NOT EXISTS idx_quiz_posts_campaign ON linkedin_quiz_posts(campaign_id, day_number);

CREATE TABLE IF NOT EXISTS linkedin_quiz_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES linkedin_quiz_posts(id) ON DELETE CASCADE,
  comment_content TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,         -- UTC: post scheduled_at + comment_delay_hours
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','action_required','published','skipped')),
  linkedin_comment_id TEXT,
  published_at TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_quiz_comments_scheduled ON linkedin_quiz_comments(scheduled_at, status);

CREATE TABLE IF NOT EXISTS linkedin_quiz_analytics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES linkedin_quiz_posts(id) ON DELETE CASCADE,
  impressions INTEGER,
  reactions INTEGER,
  comments INTEGER,
  reposts INTEGER,
  engagement_rate REAL,
  followers_gained INTEGER,
  captured_at TEXT NOT NULL
);
