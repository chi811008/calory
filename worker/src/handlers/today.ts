import type { Env, User } from '../types';
import { MEAL_LABELS } from '../types';
import { computeDay, type DayResult } from '../domain/calories';
import { currentStreak, streakBadge, type DayMet } from '../domain/streak';
import { localDate, addDays, localParts } from '../domain/date';
import { isDaySettled } from '../domain/schedule';
import {
  getCumulativeStats,
  getDailyTotals,
  listTodayFood,
  sumExercise,
  sumFood,
  type DayTotals,
} from '../db/repo';
import { cumulativeNetDeficit } from '../domain/weight';
import { feedbackFlex } from '../line/flex';
import { replyMessage } from '../line/client';

const STREAK_WINDOW_DAYS = 30;

export interface DaySummary {
  date: string;
  settled: boolean; // 是否已「結算」(可慶祝達標),見 isDaySettled
  result: DayResult;
  intake: number;
  burn: number;
  streak: number;
  badge: string | null;
  cumulativeDeficit: number; // 全程累積淨赤字 (跨所有日期),供「距離下一公斤」進度條
}

/** 建立 endDate 往回 [fromOffset..toOffset] 天的達標陣列 (升冪)。未記錄視為未達標,以中斷連續。 */
function metRange(
  endDate: string,
  fromOffset: number,
  toOffset: number,
  totals: Map<string, DayTotals>,
  user: User,
): DayMet[] {
  const days: DayMet[] = [];
  for (let i = fromOffset; i >= toOffset; i--) {
    const date = addDays(endDate, -i);
    const t = totals.get(date);
    const met = t
      ? computeDay({
          tdee: user.tdee,
          intake: t.intake,
          exerciseBurn: t.burn,
          targetDeficit: user.targetDeficit,
        }).met
      : false;
    days.push({ date, met });
  }
  return days;
}

/**
 * 算出某日的收支與連續達標。
 * - closed=false (進行中的今日):連續天數 = 截至昨天的連續達標;今天**要等結算後**
 *   (睡前統計窗, 見 isDaySettled) 且達標才 +1。白天進行中即使此刻低於目標也先不加,
 *   避免「中午達標 → 晚餐吃爆」的虛加;未達標也不歸零 (進行中保留昨天為止的連續)。
 * - closed=true (已結束的某日,如昨日報):直接以「含當日」的連續達標計算,未達標即歸零。
 */
export async function computeDaySummary(
  env: Env,
  user: User,
  date: string,
  closed: boolean,
): Promise<DaySummary> {
  const intake = await sumFood(env, user.lineUserId, date);
  const burn = await sumExercise(env, user.lineUserId, date);
  const result = computeDay({
    tdee: user.tdee,
    intake,
    exerciseBurn: burn,
    targetDeficit: user.targetDeficit,
  });

  // 今天是否已結算 (睡前統計窗)。closed 的日子一律視為已結算。
  const settled = isDaySettled(closed, localParts(user.tz).hour, user.bedtimeHour);

  const totals = await getDailyTotals(env, user.lineUserId, addDays(date, -STREAK_WINDOW_DAYS), date);
  let streak: number;
  if (closed) {
    streak = currentStreak(metRange(date, STREAK_WINDOW_DAYS, 0, totals, user));
  } else {
    streak = currentStreak(metRange(date, STREAK_WINDOW_DAYS, 1, totals, user));
    // 結算後才把今天計入;未結算前即使達標也先不 +1。
    if (result.met && settled) streak += 1;
  }

  const cum = await getCumulativeStats(env, user.lineUserId);
  const cumulativeDeficit = cumulativeNetDeficit(
    user.tdee,
    cum.daysLogged,
    cum.totalIntake,
    cum.totalBurn,
  );

  return {
    date,
    settled,
    result,
    intake,
    burn,
    streak,
    badge: streakBadge(streak),
    cumulativeDeficit,
  };
}

/** 把日收支組成回饋卡 (Flex)。即時回覆與排程推播共用。 */
export function daySummaryFlex(
  headline: string,
  user: User,
  s: DaySummary,
  liffUrl?: string,
): object {
  return feedbackFlex({
    headline,
    date: s.date,
    settled: s.settled,
    result: s.result,
    intake: s.intake,
    tdee: user.tdee,
    exerciseBurn: s.burn,
    targetDeficit: user.targetDeficit,
    streak: s.streak,
    badge: s.badge,
    cumulativeDeficit: s.cumulativeDeficit,
    liffUrl,
  });
}

/** 計算今日收支,組出即時回饋卡並回覆。logFood / editFood / handleToday 共用。 */
export async function replyDaySummary(
  env: Env,
  user: User,
  replyToken: string,
  headline: string,
): Promise<void> {
  const today = localDate(user.tz);
  const summary = await computeDaySummary(env, user, today, false);
  const msg = daySummaryFlex(headline, user, summary, env.LIFF_URL);
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [msg]);
}

export async function handleToday(env: Env, user: User, replyToken: string): Promise<void> {
  const today = localDate(user.tz);
  const rows = await listTodayFood(env, user.lineUserId, today);
  const summary = await computeDaySummary(env, user, today, false);
  const flex = daySummaryFlex('今日進度', user, summary, env.LIFF_URL);

  // 有食物記錄時,附上帶編號的清單,供「改 N / 刪 N」指定要改哪一筆。
  const messages: object[] = [];
  if (rows.length > 0) {
    const lines = [
      '🍽️ 今日食物記錄',
      ...rows.map((r, i) => {
        const name = r.label ? `${MEAL_LABELS[r.meal]}・${r.label}` : MEAL_LABELS[r.meal];
        return `${i + 1}. ${name} ${r.calories} 卡`;
      }),
    ];
    messages.push({ type: 'text', text: lines.join('\n') });
  }
  messages.push(flex);
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, messages);
}
