import type { Env, User } from '../types';
import type { ParsedCommand } from '../domain/parse';
import { localDate } from '../domain/date';
import { insertExercise } from '../db/repo';
import { replyDaySummary } from './today';

type ExerciseCmd = Extract<ParsedCommand, { kind: 'exercise' }>;

export async function handleExercise(
  env: Env,
  user: User,
  cmd: ExerciseCmd,
  replyToken: string,
): Promise<void> {
  const date = localDate(user.tz);
  await insertExercise(env, user.lineUserId, date, cmd.calories, cmd.label ?? null);
  const what = cmd.label ?? '運動';
  await replyDaySummary(env, user, replyToken, `已記錄 ${what} 消耗 ${cmd.calories} 卡`);
}
