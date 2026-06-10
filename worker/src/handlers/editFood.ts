import type { Env, User } from '../types';
import { MEAL_LABELS } from '../types';
import { localDate } from '../domain/date';
import { listTodayFood, updateFood, deleteFood } from '../db/repo';
import { replyMessage } from '../line/client';
import { replyDaySummary } from './today';

function outOfRange(env: Env, token: string, n: number): Promise<void> {
  return replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, token, [
    {
      type: 'text',
      text:
        n === 0
          ? '今天還沒有食物記錄可以修改。'
          : `找不到第 ${n} 筆,打「今日」看目前的編號。`,
    },
  ]);
}

/** 「改 N C」:把今日第 N 筆食物 (依清單序號) 改成 C 卡。 */
export async function handleEditFood(
  env: Env,
  user: User,
  index: number,
  calories: number,
  replyToken: string,
): Promise<void> {
  const date = localDate(user.tz);
  const rows = await listTodayFood(env, user.lineUserId, date);
  const row = rows[index - 1];
  if (!row) return outOfRange(env, replyToken, rows.length === 0 ? 0 : index);

  await updateFood(env, user.lineUserId, row.id, calories);
  const name = row.label ? `${MEAL_LABELS[row.meal]}・${row.label}` : MEAL_LABELS[row.meal];
  await replyDaySummary(env, user, replyToken, `✏️ 已把「${name}」改成 ${calories} 卡`);
}

/** 「刪 N」:刪掉今日第 N 筆食物。 */
export async function handleDeleteFood(
  env: Env,
  user: User,
  index: number,
  replyToken: string,
): Promise<void> {
  const date = localDate(user.tz);
  const rows = await listTodayFood(env, user.lineUserId, date);
  const row = rows[index - 1];
  if (!row) return outOfRange(env, replyToken, rows.length === 0 ? 0 : index);

  await deleteFood(env, user.lineUserId, row.id);
  const name = row.label ? `${MEAL_LABELS[row.meal]}・${row.label}` : MEAL_LABELS[row.meal];
  await replyDaySummary(env, user, replyToken, `🗑️ 已刪除「${name}」${row.calories} 卡`);
}
