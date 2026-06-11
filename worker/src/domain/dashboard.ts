import { computeDay } from './calories';
import { summarizeWeek, type WeekSummary } from './weekly';
import { currentStreak, streakBadge, type DayMet } from './streak';
import { KCAL_PER_KG, heartFills } from './weight';
import type { DayTotals } from '../db/repo';
import { MEAL_LABELS, type Meal } from '../types';

// 各餐別圖固定排列順序 (與 MEAL_LABELS 一致), 缺的餐別補 0 方便比較。
const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];

// LIFF 儀表板的資料聚合 —— 純函式。重用 computeDay / summarizeWeek / streak,
// 確保圖表數字與即時回饋卡、週報完全一致。

const WEEK_DAYS = 7;

export interface DashboardPoint {
  date: string; // YYYY-MM-DD
  logged: boolean; // 當天是否有任何記錄 (沒記錄則下列數值為 0, 圖表畫空白)
  intake: number;
  burn: number;
  deficit: number; // 支出 - 攝取 (負值代表吃超標); 未記錄日為 0
  met: boolean; // 未記錄日一律 false (與 today.ts streak 邏輯一致, 空白日中斷連續)
}

export interface MealBar {
  meal: Meal;
  label: string;
  calories: number;
}

export interface GoalProgress {
  goalKg: number; // 目標減重公斤數
  lostKg: number; // 全程累積已減公斤 (可負:淨增重)
  hearts: number[]; // 長度 = goalKg, 每顆愛心填滿比例 0..1
  achieved: boolean; // 是否已達成 (lostKg >= goalKg)
}

export interface Dashboard {
  tdee: number;
  target: number; // 目標赤字
  series: DashboardPoint[]; // 升冪, 長度 = rangeDays, 未記錄日以 0 補
  meals: MealBar[]; // 今日各餐別攝取, 固定 5 類順序, 缺的補 0
  goal: GoalProgress | null; // 減重目標愛心進度 (全程累積); 未設定目標則為 null
  week: WeekSummary; // 最近 7 天 (僅計有記錄日)
  streak: number;
  badge: string | null;
}

/**
 * 聚合儀表板資料。
 * - `dates`: 升冪排序的完整視窗 (呼叫端固定給 30 天), 最後一天為今日 (進行中)。
 * - `totals`: 有記錄日的攝取/運動 map (沒記錄的日期不在 map 內)。
 * - `rangeDays`: 圖表要顯示的天數 (7|14|30); streak 與 week 仍以完整視窗計算,
 *   不受圖表縮放影響。
 *
 * streak 與 today.ts 的進行中邏輯一致:今日尚未達標不歸零 (只看到昨天為止的連續),
 * 今日已達標則 +1。
 */
export function buildDashboard(
  dates: string[],
  totals: Map<string, DayTotals>,
  tdee: number,
  targetDeficit: number,
  rangeDays: number,
  mealTotals: Map<Meal, number>,
  goalKg = 0, // 0 = 未設定減重目標
  cumulativeDeficit = 0, // 全程累積淨赤字 (跨所有日期), 換算愛心進度用
): Dashboard {
  const allPoints: DashboardPoint[] = dates.map((date) => {
    const t = totals.get(date);
    if (!t) {
      // 沒記錄的日子:空白, 不計達標 (才能正確中斷 streak;否則 0 攝取會被算成達標)。
      return { date, logged: false, intake: 0, burn: 0, deficit: 0, met: false };
    }
    const r = computeDay({ tdee, intake: t.intake, exerciseBurn: t.burn, targetDeficit });
    return { date, logged: true, intake: t.intake, burn: t.burn, deficit: r.deficit, met: r.met };
  });

  // streak:看到昨天為止的連續達標 (未記錄日 → 未達標 → 中斷),今日若已達標再 +1。
  const metDays: DayMet[] = allPoints.map((p) => ({ date: p.date, met: p.met }));
  let streak = currentStreak(metDays.slice(0, -1));
  const todayMet = metDays[metDays.length - 1]?.met ?? false;
  if (todayMet) streak += 1;

  // week:最近 7 天中有記錄的日子。
  const weekDays: DayTotals[] = dates
    .slice(-WEEK_DAYS)
    .map((d) => totals.get(d))
    .filter((t): t is DayTotals => t !== undefined);
  const week = summarizeWeek(weekDays, tdee, targetDeficit);

  // 各餐別:固定 5 類順序輸出, 缺的餐別補 0。
  const meals: MealBar[] = MEAL_ORDER.map((meal) => ({
    meal,
    label: MEAL_LABELS[meal],
    calories: mealTotals.get(meal) ?? 0,
  }));

  // 減重目標愛心:全程累積淨赤字 ÷ 7700 = 已減公斤, 分配到 goalKg 顆愛心。
  const lostKg = cumulativeDeficit / KCAL_PER_KG;
  const goal: GoalProgress | null =
    goalKg > 0
      ? { goalKg, lostKg, hearts: heartFills(lostKg, goalKg), achieved: lostKg >= goalKg }
      : null;

  return {
    tdee,
    target: targetDeficit,
    series: allPoints.slice(-rangeDays),
    meals,
    goal,
    week,
    streak,
    badge: streakBadge(streak),
  };
}
