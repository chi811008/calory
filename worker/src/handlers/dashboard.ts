import type { Env } from '../types';
import { verifyIdToken } from '../line/verify';
import {
  ensureUser,
  getDailyTotals,
  getMealItemsByDay,
  getCumulativeStats,
  getWeightLogs,
} from '../db/repo';
import { localDate, addDays, localParts } from '../domain/date';
import { buildDashboard } from '../domain/dashboard';
import { cumulativeNetDeficit } from '../domain/weight';
import { isDaySettled } from '../domain/schedule';

// LIFF 儀表板資料 API。前端帶 LINE id_token (Authorization: Bearer ...) 來,
// 後端驗證換出 userId 後才查資料,確保資料隔離。

const WINDOW_DAYS = 30; // 固定查 30 天:涵蓋最大圖表區間, 同時供 streak/week 計算。
const MEAL_WINDOW_DAYS = 7; // 各餐別圖保留過往 7 天 (今天 + 前 6 天)。
const ALLOWED_RANGES = [7, 14, 30];
const DEFAULT_RANGE = 30;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function handleDashboardApi(env: Env, req: Request): Promise<Response> {
  const auth = req.headers.get('Authorization') ?? '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const userId = await verifyIdToken(env.LIFF_CHANNEL_ID ?? '', idToken);
  if (!userId) return json({ success: false, error: 'unauthorized' }, 401);

  const rangeParam = Number(new URL(req.url).searchParams.get('range'));
  const rangeDays = ALLOWED_RANGES.includes(rangeParam) ? rangeParam : DEFAULT_RANGE;

  try {
    const user = await ensureUser(env, userId);
    const today = localDate(user.tz);
    const fromDate = addDays(today, -(WINDOW_DAYS - 1));
    const totals = await getDailyTotals(env, userId, fromDate, today);
    // 體重曲線:取完整視窗, domain 再依 rangeDays 裁切。
    const weightLogs = await getWeightLogs(env, userId, fromDate, today);

    // 各餐別圖:保留過往 7 天 (今天 + 前 6 天),每天一個 tab。逐筆食物 (供點開明細)。
    const mealFrom = addDays(today, -(MEAL_WINDOW_DAYS - 1));
    const mealDayItems = await getMealItemsByDay(env, userId, mealFrom, today);

    // 減重目標愛心:用全程累積淨赤字 (與每日卡的「累積淨赤字」同一套帳), 不隨區間變。
    const cum = await getCumulativeStats(env, userId);
    const cumulativeDeficit = cumulativeNetDeficit(
      user.tdee,
      cum.daysLogged,
      cum.totalIntake,
      cum.totalBurn,
    );

    // 今天是否已結算 (睡前統計窗):未結算前今天不計入 streak。
    const todaySettled = isDaySettled(false, localParts(user.tz).hour, user.bedtimeHour);

    const dates: string[] = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) dates.push(addDays(today, -i));

    const dashboard = buildDashboard(
      dates,
      totals,
      user.tdee,
      user.targetDeficit,
      rangeDays,
      mealDayItems,
      user.goalKg,
      cumulativeDeficit,
      todaySettled,
      weightLogs,
    );
    return json({ success: true, data: dashboard });
  } catch (err) {
    console.error('dashboard api error', err);
    return json({ success: false, error: 'internal error' }, 500);
  }
}
