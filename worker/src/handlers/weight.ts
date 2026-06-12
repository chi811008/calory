import type { Env, User } from '../types';
import { insertWeight, getLatestWeight } from '../db/repo';
import { localDate } from '../domain/date';
import { replyMessage } from '../line/client';

// 體重指令:「體重 70」記錄 (同日覆蓋)、「體重」查最近一次。變化曲線顯示在 LIFF 儀表板。

// 合理範圍防呆 (與個人化引導同界):過小/過大多半是打錯。
const MIN_WEIGHT = 30;
const MAX_WEIGHT = 300;

function text(env: Env, token: string, body: string): Promise<void> {
  return replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, token, [{ type: 'text', text: body }]);
}

function dashboardHint(env: Env): string {
  return env.LIFF_URL ? `\n打開儀表板看體重曲線 👉 ${env.LIFF_URL}` : '';
}

/** 「體重 N」:記錄今天的體重 (同日重複記則覆蓋)。 */
export async function handleSetWeight(
  env: Env,
  user: User,
  weightKg: number,
  replyToken: string,
): Promise<void> {
  if (weightKg < MIN_WEIGHT || weightKg > MAX_WEIGHT) {
    await text(env, replyToken, `體重數字怪怪的,請輸入 ${MIN_WEIGHT}～${MAX_WEIGHT} 公斤之間 🙂`);
    return;
  }
  const date = localDate(user.tz);
  const rounded = Math.round(weightKg * 10) / 10; // 保留一位小數
  await insertWeight(env, user.lineUserId, date, rounded);
  await text(env, replyToken, `⚖️ 已記錄今天體重:${rounded} 公斤${dashboardHint(env)}`);
}

/** 「體重」:查詢最近一次記錄的體重。 */
export async function handleShowWeight(env: Env, user: User, replyToken: string): Promise<void> {
  const latest = await getLatestWeight(env, user.lineUserId);
  if (!latest) {
    await text(env, replyToken, '你還沒記過體重。\n打「體重 70」就能記錄,之後在儀表板看變化曲線 ⚖️');
    return;
  }
  await text(
    env,
    replyToken,
    `⚖️ 最近一次體重:${latest.weightKg} 公斤 (${latest.date})${dashboardHint(env)}`,
  );
}
