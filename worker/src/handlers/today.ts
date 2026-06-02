import type { Env, User } from '../types';
import { computeDay, type DayResult } from '../domain/calories';
import { currentStreak, streakBadge, type DayMet } from '../domain/streak';
import { localDate, addDays } from '../domain/date';
import { getDailyTotals, sumExercise, sumFood, type DayTotals } from '../db/repo';
import { feedbackFlex } from '../line/flex';
import { replyMessage } from '../line/client';

const STREAK_WINDOW_DAYS = 30;

export interface DaySummary {
  result: DayResult;
  intake: number;
  burn: number;
  streak: number;
  badge: string | null;
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
 * - closed=false (進行中的今日):連續天數 = 截至昨天的連續達標,今天若已達標再 +1
 *   (避免白天進行中就把連續歸零)。
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

  const totals = await getDailyTotals(env, user.lineUserId, addDays(date, -STREAK_WINDOW_DAYS), date);
  let streak: number;
  if (closed) {
    streak = currentStreak(metRange(date, STREAK_WINDOW_DAYS, 0, totals, user));
  } else {
    streak = currentStreak(metRange(date, STREAK_WINDOW_DAYS, 1, totals, user));
    if (result.met) streak += 1;
  }

  return { result, intake, burn, streak, badge: streakBadge(streak) };
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
    result: s.result,
    intake: s.intake,
    tdee: user.tdee,
    exerciseBurn: s.burn,
    targetDeficit: user.targetDeficit,
    streak: s.streak,
    badge: s.badge,
    liffUrl,
  });
}

/** 計算今日收支,組出即時回饋卡並回覆。logFood / logExercise / handleToday 共用。 */
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
  await replyDaySummary(env, user, replyToken, '今日進度');
}
