import type { Env, User } from '../types';
import { MEAL_LABELS } from '../types';
import type { ParsedCommand } from '../domain/parse';
import { localDate } from '../domain/date';
import { insertFood } from '../db/repo';
import { replyDaySummary } from './today';

type FoodCmd = Extract<ParsedCommand, { kind: 'food' }>;

export async function handleFood(
  env: Env,
  user: User,
  cmd: FoodCmd,
  replyToken: string,
): Promise<void> {
  const date = localDate(user.tz);
  await insertFood(env, user.lineUserId, date, cmd.meal, cmd.calories, cmd.label ?? null);
  const what = cmd.label ? `${MEAL_LABELS[cmd.meal]}・${cmd.label}` : MEAL_LABELS[cmd.meal];
  await replyDaySummary(env, user, replyToken, `已記錄 ${what} ${cmd.calories} 卡`);
}
