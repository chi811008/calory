import type { Env, User } from '../types';
import { localDate } from '../domain/date';
import { listTodayExercise, updateExercise, deleteExercise } from '../db/repo';
import { replyMessage } from '../line/client';
import { replyDaySummary } from './today';

function outOfRange(env: Env, token: string, n: number): Promise<void> {
  return replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, token, [
    {
      type: 'text',
      text:
        n === 0
          ? '今天還沒有運動記錄。\n記一筆：運動 300 / 跑步 250'
          : `找不到第 ${n} 筆運動,打「運動清單」看目前的編號。`,
    },
  ]);
}

/** 「運動清單」:列出今日運動記錄 (帶編號,供「改運動 N / 刪運動 N」指定)。 */
export async function handleListExercise(
  env: Env,
  user: User,
  replyToken: string,
): Promise<void> {
  const date = localDate(user.tz);
  const rows = await listTodayExercise(env, user.lineUserId, date);
  if (rows.length === 0) {
    return replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [
      { type: 'text', text: '今天還沒有運動記錄。\n記一筆：運動 300 / 跑步 250' },
    ]);
  }

  const total = rows.reduce((sum, r) => sum + r.caloriesBurned, 0);
  const lines = [
    '🏃 今日運動記錄',
    ...rows.map((r, i) => `${i + 1}. ${r.label ?? '運動'} 消耗 ${r.caloriesBurned} 卡`),
    `　共消耗 ${total} 卡`,
    '',
    '改：改運動 2 250　刪：刪運動 3',
  ];
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [
    { type: 'text', text: lines.join('\n') },
  ]);
}

/** 「改運動 N C」:把今日第 N 筆運動 (依清單序號) 改成消耗 C 卡。 */
export async function handleEditExercise(
  env: Env,
  user: User,
  index: number,
  calories: number,
  replyToken: string,
): Promise<void> {
  const date = localDate(user.tz);
  const rows = await listTodayExercise(env, user.lineUserId, date);
  const row = rows[index - 1];
  if (!row) return outOfRange(env, replyToken, rows.length === 0 ? 0 : index);

  await updateExercise(env, user.lineUserId, row.id, calories);
  await replyDaySummary(env, user, replyToken, `✏️ 已把「${row.label ?? '運動'}」改成消耗 ${calories} 卡`);
}

/** 「刪運動 N」:刪掉今日第 N 筆運動。 */
export async function handleDeleteExercise(
  env: Env,
  user: User,
  index: number,
  replyToken: string,
): Promise<void> {
  const date = localDate(user.tz);
  const rows = await listTodayExercise(env, user.lineUserId, date);
  const row = rows[index - 1];
  if (!row) return outOfRange(env, replyToken, rows.length === 0 ? 0 : index);

  await deleteExercise(env, user.lineUserId, row.id);
  await replyDaySummary(
    env,
    user,
    replyToken,
    `🗑️ 已刪除運動「${row.label ?? '運動'}」消耗 ${row.caloriesBurned} 卡`,
  );
}
