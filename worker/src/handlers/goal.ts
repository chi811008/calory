import type { Env, User } from '../types';
import { setGoalKg, getCumulativeStats } from '../db/repo';
import { cumulativeNetDeficit, KCAL_PER_KG } from '../domain/weight';
import { replyMessage } from '../line/client';

// 減重目標指令:「目標 4 公斤」設定、「目標」查詢。愛心進度顯示在 LIFF 儀表板。

const MAX_GOAL_KG = 50; // 上限防呆 (一次設太大沒意義)

function text(env: Env, token: string, body: string): Promise<void> {
  return replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, token, [{ type: 'text', text: body }]);
}

/** 算目前全程已減幾公斤 (與每日卡「累積淨赤字」同一套帳)。 */
async function lostKg(env: Env, user: User): Promise<number> {
  const cum = await getCumulativeStats(env, user.lineUserId);
  const deficit = cumulativeNetDeficit(user.tdee, cum.daysLogged, cum.totalIntake, cum.totalBurn);
  return deficit / KCAL_PER_KG;
}

function dashboardHint(env: Env): string {
  return env.LIFF_URL ? `\n打開儀表板看愛心進度 👉 ${env.LIFF_URL}` : '';
}

/** 「目標 N 公斤」:設定/更新減重目標。 */
export async function handleSetGoal(
  env: Env,
  user: User,
  goalKg: number,
  replyToken: string,
): Promise<void> {
  if (goalKg > MAX_GOAL_KG) {
    await text(env, replyToken, `目標太大囉,請設定 1～${MAX_GOAL_KG} 公斤之間 🙂`);
    return;
  }
  await setGoalKg(env, user.lineUserId, goalKg);
  const lost = await lostKg(env, user);
  const lostLine =
    lost >= 0 ? `目前已減約 ${lost.toFixed(2)} 公斤` : `目前淨增約 ${Math.abs(lost).toFixed(2)} 公斤`;
  await text(
    env,
    replyToken,
    `🎯 已設定減重目標:${goalKg} 公斤\n${lostLine}${dashboardHint(env)}`,
  );
}

/** 「目標」:查詢目前的減重目標與進度。 */
export async function handleShowGoal(env: Env, user: User, replyToken: string): Promise<void> {
  if (!user.goalKg) {
    await text(env, replyToken, '你還沒設定減重目標。\n打「目標 4 公斤」就能設定 🎯');
    return;
  }
  const lost = await lostKg(env, user);
  const clamped = Math.max(0, Math.min(lost, user.goalKg));
  const lostLine =
    lost >= 0 ? `已減約 ${lost.toFixed(2)} 公斤` : `目前淨增約 ${Math.abs(lost).toFixed(2)} 公斤`;
  await text(
    env,
    replyToken,
    `🎯 減重目標:${user.goalKg} 公斤\n${lostLine} (${clamped.toFixed(2)}/${user.goalKg})${dashboardHint(env)}`,
  );
}
