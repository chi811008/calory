import { describe, it, expect } from 'vitest';
import { buildDashboard } from '../src/domain/dashboard';
import type { DayTotals } from '../src/db/repo';
import type { Meal } from '../src/types';

const NO_MEALS = new Map<Meal, number>();

// 建一段升冪日期 (endDate 往回 n 天, 含 endDate), 最後一天為「今日」。
function rangeDates(endDate: string, n: number): string[] {
  const out: string[] = [];
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(endMs - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

const TDEE = 1800;
const TARGET = 400;

describe('buildDashboard', () => {
  it('每個區間日都有一個 series 點, 未記錄日攝取/運動為 0', () => {
    const dates = rangeDates('2026-06-02', 30);
    const totals = new Map<string, DayTotals>();
    totals.set('2026-06-01', { intake: 1200, burn: 100 }); // 昨日有記錄

    const d = buildDashboard(dates, totals, TDEE, TARGET, 14, NO_MEALS);

    // 圖表只回傳要求的區間長度 (14)
    expect(d.series).toHaveLength(14);
    // 最後一點是今日
    expect(d.series[d.series.length - 1].date).toBe('2026-06-02');
    // 未記錄的今日: intake/burn = 0
    const today = d.series[d.series.length - 1];
    expect(today.intake).toBe(0);
    expect(today.burn).toBe(0);
    // 有記錄的昨日 deficit = (1800+100) - 1200 = 700, 達標
    const yesterday = d.series.find((p) => p.date === '2026-06-01')!;
    expect(yesterday.deficit).toBe(700);
    expect(yesterday.met).toBe(true);
  });

  it('rangeDays 控制圖表長度, streak/week 仍用完整 30 天視窗', () => {
    const dates = rangeDates('2026-06-02', 30);
    const totals = new Map<string, DayTotals>();
    // 連續 5 天達標 (含到昨天), 今日尚未記錄
    for (const dt of ['2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31', '2026-06-01']) {
      totals.set(dt, { intake: 1000, burn: 0 }); // deficit 800, 達標
    }

    const d7 = buildDashboard(dates, totals, TDEE, TARGET, 7, NO_MEALS);
    expect(d7.series).toHaveLength(7);
    // 即使圖表只看 7 天, streak 仍正確算出 5 (跨越 7 天視窗外亦可, 此處剛好 5)
    expect(d7.streak).toBe(5);
  });

  it('今日進行中尚未達標時不歸零 streak (與 today 卡一致)', () => {
    const dates = rangeDates('2026-06-02', 30);
    const totals = new Map<string, DayTotals>();
    // 昨日與前日達標
    totals.set('2026-05-31', { intake: 1000, burn: 0 });
    totals.set('2026-06-01', { intake: 1000, burn: 0 });
    // 今日只吃了一點, 還沒達標 (deficit 小)
    totals.set('2026-06-02', { intake: 1700, burn: 0 }); // deficit 100 < 400

    const d = buildDashboard(dates, totals, TDEE, TARGET, 14, NO_MEALS);
    // 今日未達標, 但因進行中不歸零 → 維持昨天為止的 2
    expect(d.streak).toBe(2);
    expect(d.series[d.series.length - 1].met).toBe(false);
  });

  it('今日已達標時 streak 含今日 +1', () => {
    const dates = rangeDates('2026-06-02', 30);
    const totals = new Map<string, DayTotals>();
    totals.set('2026-05-31', { intake: 1000, burn: 0 });
    totals.set('2026-06-01', { intake: 1000, burn: 0 });
    totals.set('2026-06-02', { intake: 1000, burn: 0 }); // 今日也達標

    const d = buildDashboard(dates, totals, TDEE, TARGET, 14, NO_MEALS);
    expect(d.streak).toBe(3);
  });

  it('week 摘要只計最近 7 天有記錄的日子', () => {
    const dates = rangeDates('2026-06-02', 30);
    const totals = new Map<string, DayTotals>();
    // 最近 7 天 (5/27..6/02) 中只有 3 天有記錄
    totals.set('2026-05-28', { intake: 1000, burn: 0 }); // 達標
    totals.set('2026-05-30', { intake: 1000, burn: 0 }); // 達標
    totals.set('2026-06-01', { intake: 2500, burn: 0 }); // 吃超標
    // 7 天視窗外的記錄不該算進 week
    totals.set('2026-05-20', { intake: 1000, burn: 0 });

    const d = buildDashboard(dates, totals, TDEE, TARGET, 14, NO_MEALS);
    expect(d.week.daysLogged).toBe(3);
    expect(d.week.daysMet).toBe(2);
  });

  it('回傳 target/tdee 供前端畫目標線與標示', () => {
    const dates = rangeDates('2026-06-02', 30);
    const d = buildDashboard(dates, new Map(), TDEE, TARGET, 14, NO_MEALS);
    expect(d.target).toBe(TARGET);
    expect(d.tdee).toBe(TDEE);
    // 全無記錄 → streak 0, badge null
    expect(d.streak).toBe(0);
    expect(d.badge).toBeNull();
  });

  it('meals: 固定 5 類順序與標籤, 缺的餐別補 0', () => {
    const dates = rangeDates('2026-06-02', 30);
    const mealTotals = new Map<Meal, number>([
      ['breakfast', 300],
      ['dinner', 700],
      ['drink', 150],
    ]);

    const d = buildDashboard(dates, new Map(), TDEE, TARGET, 14, mealTotals);

    // 固定順序: 早餐/午餐/晚餐/點心/飲料
    expect(d.meals.map((m) => m.meal)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'snack',
      'drink',
    ]);
    expect(d.meals.map((m) => m.label)).toEqual(['早餐', '午餐', '晚餐', '點心', '飲料']);
    // 有記錄的餐別帶入數值, 缺的補 0
    expect(d.meals.map((m) => m.calories)).toEqual([300, 0, 700, 0, 150]);
    // 加總與輸入一致
    const sum = d.meals.reduce((acc, m) => acc + m.calories, 0);
    expect(sum).toBe(1150);
  });

  it('meals: 空資料時 5 類皆 0', () => {
    const dates = rangeDates('2026-06-02', 30);
    const d = buildDashboard(dates, new Map(), TDEE, TARGET, 14, NO_MEALS);
    expect(d.meals).toHaveLength(5);
    expect(d.meals.every((m) => m.calories === 0)).toBe(true);
  });

  it('goal: 未設定目標 (goalKg=0) → goal 為 null', () => {
    const dates = rangeDates('2026-06-02', 30);
    const d = buildDashboard(dates, new Map(), TDEE, TARGET, 14, NO_MEALS, 0, 12000);
    expect(d.goal).toBeNull();
  });

  it('goal: 4 公斤目標 + 累積 1.5 公斤赤字 → 愛心依序填滿、未達成', () => {
    const dates = rangeDates('2026-06-02', 30);
    // 1.5 公斤 = 7700 × 1.5 = 11550 卡
    const d = buildDashboard(dates, new Map(), TDEE, TARGET, 14, NO_MEALS, 4, 11550);
    expect(d.goal).not.toBeNull();
    expect(d.goal!.goalKg).toBe(4);
    expect(d.goal!.lostKg).toBeCloseTo(1.5, 5);
    expect(d.goal!.hearts).toHaveLength(4);
    expect(d.goal!.hearts[0]).toBeCloseTo(1, 5);
    expect(d.goal!.hearts[1]).toBeCloseTo(0.5, 5);
    expect(d.goal!.hearts[2]).toBe(0);
    expect(d.goal!.achieved).toBe(false);
  });

  it('goal: 累積赤字 ≥ 目標公斤 → achieved 為 true 且愛心全滿', () => {
    const dates = rangeDates('2026-06-02', 30);
    const d = buildDashboard(dates, new Map(), TDEE, TARGET, 14, NO_MEALS, 2, 7700 * 2.3);
    expect(d.goal!.achieved).toBe(true);
    expect(d.goal!.hearts).toEqual([1, 1]);
  });
});
