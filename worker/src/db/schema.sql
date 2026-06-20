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
  goal_kg         INTEGER NOT NULL DEFAULT 0,  -- 減重目標公斤數 (0 = 未設定); 愛心進度條用
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

-- 拍照記錄的對話暫存 (一使用者一張)。對話分三階段:
--   describe → 剛收到照片,只存 message_id,等補充描述或「直接估算」(estimate_json 為 NULL)。
--   review   → 已估算,estimate_json 有值,等「儲存」或繼續補充。
--   meal     → 已選儲存,等選餐別。
-- created_at 每次互動會更新 (TTL 視為閒置時間,見 isPendingFresh)。
CREATE TABLE IF NOT EXISTS pending_photo (
  user_id       TEXT PRIMARY KEY,
  message_id    TEXT,                              -- LINE 圖片 messageId (重抓 bytes 用)
  phase         TEXT NOT NULL DEFAULT 'describe',  -- describe | review | meal
  notes         TEXT,                              -- 累積的文字補充
  estimate_json TEXT,                              -- 目前估算 (describe 階段為 NULL)
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
