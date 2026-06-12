import type { Env, Meal, MealItem, Sex, User } from '../types';
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
    goalKg: Number(r.goal_kg),
    createdAt: String(r.created_at),
  };
}

/** 設定/更新減重目標公斤數 (0 = 取消目標)。 */
export async function setGoalKg(env: Env, userId: string, goalKg: number): Promise<void> {
  await env.DB.prepare('UPDATE users SET goal_kg = ? WHERE line_user_id = ?')
    .bind(goalKg, userId)
    .run();
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

export interface WeightPoint {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

/**
 * 記某日體重。一天一筆:先刪同日舊記錄再插入 (取最後一次), 曲線才不會同日多點。
 * 用刪後插而非 unique index, 避免動到已部署的 weight_logs 資料表。
 */
export async function insertWeight(
  env: Env,
  userId: string,
  date: string,
  weightKg: number,
): Promise<void> {
  await env.DB.prepare('DELETE FROM weight_logs WHERE user_id = ? AND date = ?')
    .bind(userId, date)
    .run();
  await env.DB.prepare('INSERT INTO weight_logs (user_id, date, weight_kg) VALUES (?, ?, ?)')
    .bind(userId, date, weightKg)
    .run();
}

/** 取區間 [fromDate, toDate] 內的體重記錄, 依日期升冪 (一天一筆, 寫入端已去重)。 */
export async function getWeightLogs(
  env: Env,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<WeightPoint[]> {
  const res = await env.DB.prepare(
    'SELECT date, weight_kg FROM weight_logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, id',
  )
    .bind(userId, fromDate, toDate)
    .all<{ date: string; weight_kg: number }>();
  return (res.results ?? []).map((r) => ({ date: r.date, weightKg: Number(r.weight_kg) }));
}

/** 取最近一次體重記錄 (查詢用); 無記錄則 null。 */
export async function getLatestWeight(env: Env, userId: string): Promise<WeightPoint | null> {
  const res = await env.DB.prepare(
    'SELECT date, weight_kg FROM weight_logs WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 1',
  )
    .bind(userId)
    .first<{ date: string; weight_kg: number }>();
  return res ? { date: res.date, weightKg: Number(res.weight_kg) } : null;
}

export interface Preset {
  label: string;
  calories: number;
}

/** 查單筆範本 (精確比對 label;呼叫端先 trim)。 */
export async function findPreset(
  env: Env,
  userId: string,
  label: string,
): Promise<Preset | null> {
  const row = await env.DB.prepare(
    'SELECT label, calories FROM meal_presets WHERE user_id = ? AND label = ?',
  )
    .bind(userId, label)
    .first<{ label: string; calories: number }>();
  return row ? { label: row.label, calories: Number(row.calories) } : null;
}

/** 存/覆蓋範本 (同名 upsert,靠 idx_preset_user_label 唯一索引)。 */
export async function savePreset(
  env: Env,
  userId: string,
  label: string,
  calories: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO meal_presets (user_id, label, calories) VALUES (?, ?, ?)
       ON CONFLICT(user_id, label)
       DO UPDATE SET calories = excluded.calories, created_at = datetime('now')`,
  )
    .bind(userId, label, calories)
    .run();
}

export async function listPresets(env: Env, userId: string): Promise<Preset[]> {
  const res = await env.DB.prepare(
    'SELECT label, calories FROM meal_presets WHERE user_id = ? ORDER BY label',
  )
    .bind(userId)
    .all<{ label: string; calories: number }>();
  return (res.results ?? []).map((r) => ({ label: r.label, calories: Number(r.calories) }));
}

/** 刪範本。回傳 true 代表確實刪了一筆 (供 handler 區分「找不到」)。 */
export async function deletePreset(
  env: Env,
  userId: string,
  label: string,
): Promise<boolean> {
  const res = await env.DB.prepare(
    'DELETE FROM meal_presets WHERE user_id = ? AND label = ?',
  )
    .bind(userId, label)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export interface FoodRow {
  id: number;
  meal: Meal;
  label: string | null;
  calories: number;
  source: string;
}

/** 取某日的食物記錄,依 id 升冪 (提供穩定的「今日序號 → id」對應,供改/刪用)。 */
export async function listTodayFood(
  env: Env,
  userId: string,
  date: string,
): Promise<FoodRow[]> {
  const res = await env.DB.prepare(
    'SELECT id, meal, label, calories, source FROM food_logs WHERE user_id = ? AND date = ? ORDER BY id',
  )
    .bind(userId, date)
    .all<Row>();
  return (res.results ?? []).map((r) => ({
    id: Number(r.id),
    meal: r.meal as Meal,
    label: r.label === null || r.label === undefined ? null : String(r.label),
    calories: Number(r.calories),
    source: String(r.source),
  }));
}

/** 改某筆食物熱量。WHERE 帶 user_id 確保不會動到別人的記錄。回傳是否有更新。 */
export async function updateFood(
  env: Env,
  userId: string,
  id: number,
  calories: number,
): Promise<boolean> {
  const res = await env.DB.prepare(
    'UPDATE food_logs SET calories = ? WHERE id = ? AND user_id = ?',
  )
    .bind(calories, id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** 刪某筆食物。WHERE 帶 user_id 確保隔離。回傳是否有刪除。 */
export async function deleteFood(env: Env, userId: string, id: number): Promise<boolean> {
  const res = await env.DB.prepare('DELETE FROM food_logs WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export interface ExerciseRow {
  id: number;
  label: string | null;
  caloriesBurned: number;
}

/** 取某日的運動記錄,依 id 升冪 (穩定的「今日序號 → id」對應,供改運動/刪運動用)。 */
export async function listTodayExercise(
  env: Env,
  userId: string,
  date: string,
): Promise<ExerciseRow[]> {
  const res = await env.DB.prepare(
    'SELECT id, label, calories_burned FROM exercise_logs WHERE user_id = ? AND date = ? ORDER BY id',
  )
    .bind(userId, date)
    .all<Row>();
  return (res.results ?? []).map((r) => ({
    id: Number(r.id),
    label: r.label === null || r.label === undefined ? null : String(r.label),
    caloriesBurned: Number(r.calories_burned),
  }));
}

/** 改某筆運動消耗。WHERE 帶 user_id 確保隔離。回傳是否有更新。 */
export async function updateExercise(
  env: Env,
  userId: string,
  id: number,
  caloriesBurned: number,
): Promise<boolean> {
  const res = await env.DB.prepare(
    'UPDATE exercise_logs SET calories_burned = ? WHERE id = ? AND user_id = ?',
  )
    .bind(caloriesBurned, id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** 刪某筆運動。WHERE 帶 user_id 確保隔離。回傳是否有刪除。 */
export async function deleteExercise(env: Env, userId: string, id: number): Promise<boolean> {
  const res = await env.DB.prepare('DELETE FROM exercise_logs WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
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

export interface CumulativeStats {
  daysLogged: number; // 有任何記錄 (食物或運動) 的不重複天數
  totalIntake: number; // 全程攝取總和
  totalBurn: number; // 全程運動消耗總和
}

/** 取得使用者全程累積統計 (跨所有日期),供「距離下一公斤」進度條換算。 */
export async function getCumulativeStats(
  env: Env,
  userId: string,
): Promise<CumulativeStats> {
  const intakeRow = await env.DB.prepare(
    'SELECT COALESCE(SUM(calories), 0) AS total FROM food_logs WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ total: number }>();

  const burnRow = await env.DB.prepare(
    'SELECT COALESCE(SUM(calories_burned), 0) AS total FROM exercise_logs WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ total: number }>();

  const daysRow = await env.DB.prepare(
    `SELECT COUNT(*) AS days FROM (
       SELECT date FROM food_logs WHERE user_id = ?
       UNION
       SELECT date FROM exercise_logs WHERE user_id = ?
     )`,
  )
    .bind(userId, userId)
    .first<{ days: number }>();

  return {
    daysLogged: Number(daysRow?.days ?? 0),
    totalIntake: Number(intakeRow?.total ?? 0),
    totalBurn: Number(burnRow?.total ?? 0),
  };
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

/**
 * 取得日期區間 [fromDate, toDate] 內,「每一天 × 每餐別」的逐筆食物項目。
 * 回 Map<date, Map<meal, MealItem[]>>;只含有記錄的日期/餐別,缺的由 domain 補空。
 * 每餐別內依熱量由高到低排序 (相同再依 id),點開 bar 時可一眼看到最大來源。
 * 餐別總熱量由 domain 端對 items 加總,保持單一資料來源。
 */
export async function getMealItemsByDay(
  env: Env,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<Map<string, Map<Meal, MealItem[]>>> {
  const map = new Map<string, Map<Meal, MealItem[]>>();
  const res = await env.DB.prepare(
    'SELECT date, meal, label, calories FROM food_logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, meal, calories DESC, id',
  )
    .bind(userId, fromDate, toDate)
    .all<{ date: string; meal: Meal; label: string | null; calories: number }>();
  for (const r of res.results ?? []) {
    let day = map.get(r.date);
    if (!day) {
      day = new Map<Meal, MealItem[]>();
      map.set(r.date, day);
    }
    let items = day.get(r.meal);
    if (!items) {
      items = [];
      day.set(r.meal, items);
    }
    items.push({
      label: r.label === null || r.label === undefined ? null : String(r.label),
      calories: Number(r.calories),
    });
  }
  return map;
}
