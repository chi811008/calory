import type { Env, Meal, Sex, User } from '../types';
import type { OnboardingDraft, OnboardingSettings } from '../domain/onboarding';
import type { PhotoEstimate } from '../domain/photo';

// 資料存取層 (repository)。所有查詢都以 line_user_id 隔離資料。

type Row = Record<string, unknown>;

function rowToUser(r: Row): User {
  return {
    lineUserId: String(r.line_user_id),
    sex: r.sex as Sex,
    age: Number(r.age),
    heightCm: Number(r.height_cm),
    weightKg: Number(r.weight_kg),
    activityFactor: Number(r.activity_factor),
    tdee: Number(r.tdee),
    targetDeficit: Number(r.target_deficit),
    bedtimeHour: Number(r.bedtime_hour),
    tz: String(r.tz),
    onboarded: Number(r.onboarded) === 1,
    createdAt: String(r.created_at),
  };
}

export async function getUser(env: Env, userId: string): Promise<User | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE line_user_id = ?')
    .bind(userId)
    .first<Row>();
  return row ? rowToUser(row) : null;
}

/** 取得使用者;不存在則以預設值建立 (Phase 2 的引導會再覆寫成個人化數值)。 */
export async function ensureUser(env: Env, userId: string): Promise<User> {
  const existing = await getUser(env, userId);
  if (existing) return existing;
  await env.DB.prepare('INSERT INTO users (line_user_id) VALUES (?)').bind(userId).run();
  const created = await getUser(env, userId);
  if (!created) throw new Error('failed to create user');
  return created;
}

/** 引導完成:把個人化設定寫回 users 並標記 onboarded。 */
export async function saveUserSettings(
  env: Env,
  userId: string,
  s: OnboardingSettings,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE users
       SET sex = ?, age = ?, height_cm = ?, weight_kg = ?, activity_factor = ?,
           tdee = ?, target_deficit = ?, bedtime_hour = ?, onboarded = 1
     WHERE line_user_id = ?`,
  )
    .bind(
      s.sex,
      s.age,
      s.heightCm,
      s.weightKg,
      s.activityFactor,
      s.tdee,
      s.targetDeficit,
      s.bedtimeHour,
      userId,
    )
    .run();
}

/** 取得進行中的引導草稿;沒有或資料損壞回 null (讓流程重新開始)。 */
export async function getOnboarding(env: Env, userId: string): Promise<OnboardingDraft | null> {
  const row = await env.DB.prepare(
    'SELECT draft_json FROM pending_onboarding WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ draft_json: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.draft_json) as OnboardingDraft;
  } catch (err) {
    console.error('corrupt onboarding draft', userId, err);
    return null;
  }
}

/** 以 upsert 寫入/更新引導草稿。 */
export async function setOnboarding(
  env: Env,
  userId: string,
  draft: OnboardingDraft,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pending_onboarding (user_id, draft_json) VALUES (?, ?)
       ON CONFLICT(user_id)
       DO UPDATE SET draft_json = excluded.draft_json, created_at = datetime('now')`,
  )
    .bind(userId, JSON.stringify(draft))
    .run();
}

export async function clearOnboarding(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM pending_onboarding WHERE user_id = ?').bind(userId).run();
}

export interface PendingPhoto {
  estimate: PhotoEstimate;
  createdAt: string;
}

/** 以 upsert 暫存照片估算 (等使用者選餐別確認)。 */
export async function setPendingPhoto(
  env: Env,
  userId: string,
  estimate: PhotoEstimate,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pending_photo (user_id, estimate_json) VALUES (?, ?)
       ON CONFLICT(user_id)
       DO UPDATE SET estimate_json = excluded.estimate_json, created_at = datetime('now')`,
  )
    .bind(userId, JSON.stringify(estimate))
    .run();
}

/** 取得 pending 照片估算;沒有或資料損壞回 null。新鮮度由呼叫端 (isPendingFresh) 判斷。 */
export async function getPendingPhoto(env: Env, userId: string): Promise<PendingPhoto | null> {
  const row = await env.DB.prepare(
    'SELECT estimate_json, created_at FROM pending_photo WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ estimate_json: string; created_at: string }>();
  if (!row) return null;
  try {
    return { estimate: JSON.parse(row.estimate_json) as PhotoEstimate, createdAt: row.created_at };
  } catch (err) {
    console.error('corrupt pending photo', userId, err);
    return null;
  }
}

export async function clearPendingPhoto(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM pending_photo WHERE user_id = ?').bind(userId).run();
}

/** 取得所有已完成引導的使用者 (排程推播對象)。 */
export async function getOnboardedUsers(env: Env): Promise<User[]> {
  const res = await env.DB.prepare('SELECT * FROM users WHERE onboarded = 1').all<Row>();
  return (res.results ?? []).map(rowToUser);
}

/**
 * 標記某推播已送出。回傳 true 代表這次是首次標記 (可推播);
 * false 代表今天這種已推過 (INSERT OR IGNORE 沒新增 → 跳過,避免重複)。
 */
export async function markNotified(
  env: Env,
  userId: string,
  date: string,
  kind: string,
): Promise<boolean> {
  const res = await env.DB.prepare(
    'INSERT OR IGNORE INTO notify_log (user_id, date, kind) VALUES (?, ?, ?)',
  )
    .bind(userId, date, kind)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function insertFood(
  env: Env,
  userId: string,
  date: string,
  meal: Meal,
  calories: number,
  label: string | null,
  source = 'manual',
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO food_logs (user_id, date, meal, label, calories, source) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(userId, date, meal, label, calories, source)
    .run();
}

export async function insertExercise(
  env: Env,
  userId: string,
  date: string,
  caloriesBurned: number,
  label: string | null,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO exercise_logs (user_id, date, label, calories_burned) VALUES (?, ?, ?, ?)',
  )
    .bind(userId, date, label, caloriesBurned)
    .run();
}

export async function sumFood(env: Env, userId: string, date: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(calories), 0) AS total FROM food_logs WHERE user_id = ? AND date = ?',
  )
    .bind(userId, date)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function sumExercise(env: Env, userId: string, date: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(calories_burned), 0) AS total FROM exercise_logs WHERE user_id = ? AND date = ?',
  )
    .bind(userId, date)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export interface DayTotals {
  intake: number;
  burn: number;
}

/** 取得日期區間 [fromDate, toDate] 內,有記錄的每日攝取與運動總量。 */
export async function getDailyTotals(
  env: Env,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<Map<string, DayTotals>> {
  const map = new Map<string, DayTotals>();

  const food = await env.DB.prepare(
    'SELECT date, SUM(calories) AS total FROM food_logs WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date',
  )
    .bind(userId, fromDate, toDate)
    .all<{ date: string; total: number }>();
  for (const r of food.results ?? []) {
    map.set(r.date, { intake: Number(r.total), burn: 0 });
  }

  const ex = await env.DB.prepare(
    'SELECT date, SUM(calories_burned) AS total FROM exercise_logs WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date',
  )
    .bind(userId, fromDate, toDate)
    .all<{ date: string; total: number }>();
  for (const r of ex.results ?? []) {
    const cur = map.get(r.date) ?? { intake: 0, burn: 0 };
    cur.burn = Number(r.total);
    map.set(r.date, cur);
  }

  return map;
}
