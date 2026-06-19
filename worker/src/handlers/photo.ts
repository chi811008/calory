import type { Env, Meal, User } from '../types';
import { MEAL_LABELS } from '../types';
import { localDate } from '../domain/date';
import type { PhotoEstimate } from '../domain/photo';
import type { PendingPhoto } from '../db/repo';
import {
  insertFood,
  startPendingPhoto,
  reviewPendingPhoto,
  setPendingPhotoMealPhase,
  clearPendingPhoto,
} from '../db/repo';
import { estimateCalories } from '../ai/gemini';
import { getMessageContent, replyMessage } from '../line/client';
import {
  askDescribeMessage,
  photoEstimateMessage,
  askMealMessage,
  photoFailedMessage,
  photoExpiredMessage,
  photoCanceledMessage,
} from '../line/photo';
import { replyDaySummary } from './today';

/** 收到食物照片:只登記 pending (存 messageId),先問要不要補充,延後到有觸發再估算。 */
export async function handlePhoto(
  env: Env,
  user: User,
  messageId: string,
  replyToken: string,
): Promise<void> {
  await startPendingPhoto(env, user.lineUserId, messageId);
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [askDescribeMessage()]);
}

/** 合併新補充與既有 notes;兩者皆空回 null。用全形分號串接,維持可讀。 */
function mergeNotes(existing: string | null, added: string | null): string | null {
  const parts = [existing, added].map((s) => s?.trim()).filter((s): s is string => !!s);
  return parts.length ? parts.join('；') : null;
}

/**
 * 重抓照片 + (累積描述) 一起送模型估算,進入 review 階段。
 * - 照片抓不回 (LINE 過期) → 清除 pending,回過期提示。
 * - 模型看不出 → 保留 pending (仍在 describe),回失敗提示,讓使用者再補充重試。
 * addedNote 為 null 表示「直接估算」(不新增描述)。
 */
export async function estimateAndReview(
  env: Env,
  user: User,
  pending: PendingPhoto,
  addedNote: string | null,
  replyToken: string,
): Promise<void> {
  if (!pending.messageId) {
    await clearPendingPhoto(env, user.lineUserId);
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [photoExpiredMessage()]);
    return;
  }

  const notes = mergeNotes(pending.notes, addedNote);

  let bytes: ArrayBuffer;
  let mime: string;
  try {
    const content = await getMessageContent(env.LINE_CHANNEL_ACCESS_TOKEN, pending.messageId);
    bytes = content.bytes;
    mime = content.mime;
  } catch (err) {
    console.error('photo content fetch failed (expired?)', err);
    await clearPendingPhoto(env, user.lineUserId);
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [photoExpiredMessage()]);
    return;
  }

  let estimate: PhotoEstimate | null = null;
  try {
    estimate = await estimateCalories(env.GEMINI_API_KEY, bytes, mime, notes ?? undefined);
  } catch (err) {
    console.error('photo estimate error', err);
  }

  if (!estimate) {
    // 保留 pending (describe),讓使用者補充後重試;不丟掉 messageId。
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [photoFailedMessage()]);
    return;
  }

  await reviewPendingPhoto(env, user.lineUserId, notes, estimate);
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [photoEstimateMessage(estimate)]);
}

/** 使用者按儲存:切到 meal 階段,問要記到哪一餐。 */
export async function askMeal(
  env: Env,
  user: User,
  pending: PendingPhoto,
  replyToken: string,
): Promise<void> {
  if (!pending.estimate) {
    // 理論上 review 階段一定有估算;防衛性處理:當沒東西可存,回失敗提示。
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [photoFailedMessage()]);
    return;
  }
  await setPendingPhotoMealPhase(env, user.lineUserId);
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [askMealMessage()]);
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
