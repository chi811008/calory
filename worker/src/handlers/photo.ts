import type { Env, Meal, User } from '../types';
import { MEAL_LABELS } from '../types';
import { localDate } from '../domain/date';
import type { PhotoEstimate } from '../domain/photo';
import { insertFood, setPendingPhoto, clearPendingPhoto } from '../db/repo';
import { estimateCalories } from '../ai/gemini';
import { getMessageContent, replyMessage } from '../line/client';
import {
  photoEstimateMessage,
  photoFailedMessage,
  photoCanceledMessage,
} from '../line/photo';
import { replyDaySummary } from './today';

/** 收到食物照片:抓圖 → Gemini 估算 → 暫存並請使用者選餐別。 */
export async function handlePhoto(
  env: Env,
  user: User,
  messageId: string,
  replyToken: string,
): Promise<void> {
  let estimate: PhotoEstimate | null = null;
  try {
    const { bytes, mime } = await getMessageContent(env.LINE_CHANNEL_ACCESS_TOKEN, messageId);
    estimate = await estimateCalories(env.GEMINI_API_KEY, bytes, mime);
  } catch (err) {
    console.error('photo estimate error', err);
  }

  if (!estimate) {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [photoFailedMessage()]);
    return;
  }

  await setPendingPhoto(env, user.lineUserId, estimate);
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [photoEstimateMessage(estimate)]);
}

/** 使用者選了餐別:把照片估算寫入 food_logs (source=photo),清除暫存,回收支卡。 */
export async function confirmPhoto(
  env: Env,
  user: User,
  estimate: PhotoEstimate,
  meal: Meal,
  replyToken: string,
): Promise<void> {
  const date = localDate(user.tz);
  await insertFood(env, user.lineUserId, date, meal, estimate.calories, estimate.label, 'photo');
  await clearPendingPhoto(env, user.lineUserId);
  await replyDaySummary(
    env,
    user,
    replyToken,
    `已記錄 ${MEAL_LABELS[meal]}・${estimate.label} ${estimate.calories} 卡 📷`,
  );
}

export async function cancelPhoto(env: Env, userId: string, replyToken: string): Promise<void> {
  await clearPendingPhoto(env, userId);
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [photoCanceledMessage()]);
}
