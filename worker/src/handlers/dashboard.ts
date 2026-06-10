import type { Env } from '../types';
import { verifyIdToken } from '../line/verify';
import { ensureUser, getDailyTotals } from '../db/repo';
import { localDate, addDays } from '../domain/date';
import { buildDashboard } from '../domain/dashboard';

// LIFF 儀表板資料 API。前端帶 LINE id_token (Authorization: Bearer ...) 來,
// 後端驗證換出 userId 後才查資料,確保資料隔離。

const WINDOW_DAYS = 30; // 固定查 30 天:涵蓋最大圖表區間, 同時供 streak/week 計算。
const ALLOWED_RANGES = [7, 14, 30];
const DEFAULT_RANGE = 14;

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

    const dates: string[] = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) dates.push(addDays(today, -i));

    const dashboard = buildDashboard(dates, totals, user.tdee, user.targetDeficit, rangeDays);
    return json({ success: true, data: dashboard });
  } catch (err) {
    console.error('dashboard api error', err);
    return json({ success: false, error: 'internal error' }, 500);
  }
}
