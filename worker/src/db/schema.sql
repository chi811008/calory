-- Calory D1 schema. 以 `wrangler d1 execute calory-db --file=src/db/schema.sql` 套用。

CREATE TABLE IF NOT EXISTS users (
  line_user_id    TEXT PRIMARY KEY,
  sex             TEXT    NOT NULL DEFAULT 'male',
  age             INTEGER NOT NULL DEFAULT 30,
  height_cm       REAL    NOT NULL DEFAULT 170,
  weight_kg       REAL    NOT NULL DEFAULT 65,
  activity_factor REAL    NOT NULL DEFAULT 1.2,
  tdee            INTEGER NOT NULL DEFAULT 1800,
  target_deficit  INTEGER NOT NULL DEFAULT 400,
  bedtime_hour    INTEGER NOT NULL DEFAULT 23,
  tz              TEXT    NOT NULL DEFAULT 'Asia/Taipei',
  onboarded       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS food_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,
  date       TEXT    NOT NULL,            -- YYYY-MM-DD (使用者當地時區)
  meal       TEXT    NOT NULL,            -- breakfast|lunch|dinner|snack|drink
  label      TEXT,
  calories   INTEGER NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'manual', -- manual|photo|preset
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_food_user_date ON food_logs(user_id, date);

CREATE TABLE IF NOT EXISTS exercise_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL,
  date            TEXT    NOT NULL,
  label           TEXT,
  calories_burned INTEGER NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ex_user_date ON exercise_logs(user_id, date);

CREATE TABLE IF NOT EXISTS weight_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,
  date       TEXT    NOT NULL,
  weight_kg  REAL    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_weight_user_date ON weight_logs(user_id, date);

CREATE TABLE IF NOT EXISTS meal_presets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  calories   INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- 同一使用者同名只留一筆,支援 upsert (存相同名稱即覆蓋熱量)。
CREATE UNIQUE INDEX IF NOT EXISTS idx_preset_user_label ON meal_presets(user_id, label);

CREATE TABLE IF NOT EXISTS pending_photo (
  user_id       TEXT PRIMARY KEY,
  estimate_json TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 個人化引導進行中的暫存草稿 (逐步問答)。完成後刪除,設定寫回 users。
CREATE TABLE IF NOT EXISTS pending_onboarding (
  user_id    TEXT PRIMARY KEY,
  draft_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 排程推播的去重記錄:同一使用者、同一當地日期、同一種類只推一次
-- (cron 可能重跑;靠 PRIMARY KEY + INSERT OR IGNORE 確保不重複)。
CREATE TABLE IF NOT EXISTS notify_log (
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,            -- 使用者當地 YYYY-MM-DD
  kind       TEXT NOT NULL,            -- bedtime|daily|weekly
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date, kind)
);
