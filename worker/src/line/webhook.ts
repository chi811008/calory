import type { Env } from '../types';
import { ensureUser, getOnboarding, getPendingPhoto } from '../db/repo';
import { parseMessage, parsePhotoReply } from '../domain/parse';
import { isPendingFresh } from '../domain/photo';
import { handleLog } from '../handlers/logFood';
import { handleToday } from '../handlers/today';
import {
  handleSavePreset,
  handleListPresets,
  handleDeletePreset,
} from '../handlers/presets';
import { handleEditFood, handleDeleteFood } from '../handlers/editFood';
import {
  handleListExercise,
  handleEditExercise,
  handleDeleteExercise,
} from '../handlers/editExercise';
import { startOnboarding, handleOnboarding } from '../handlers/onboarding';
import { handlePhoto, confirmPhoto, cancelPhoto } from '../handlers/photo';
import { replyMessage } from './client';
import { helpMessage } from './flex';

// LINE webhook 單一事件處理。目前支援文字訊息;圖片 (Phase 4) 先回提示。
export async function handleEvent(event: any, env: Env): Promise<void> {
  if (event.type !== 'message') return;
  const userId: string | undefined = event.source?.userId;
  const replyToken: string | undefined = event.replyToken;
  if (!userId || !replyToken) return;

  const message = event.message;

  if (message.type === 'text') {
    const user = await ensureUser(env, userId);
    const text = String(message.text ?? '');

    // 引導進行中:此時的文字都是對當前步驟的回答,優先於一般指令解析。
    const draft = await getOnboarding(env, userId);
    if (draft) return handleOnboarding(env, userId, draft, text, replyToken);

    // 有「新鮮的」待確認照片:純餐別 → 確認記錄;取消 → 丟棄;其他 → 落回一般指令。
    const pending = await getPendingPhoto(env, userId);
    if (pending && isPendingFresh(pending.createdAt)) {
      const reply = parsePhotoReply(text);
      if (reply.kind === 'meal') {
        return confirmPhoto(env, user, pending.estimate, reply.meal, replyToken);
      }
      if (reply.kind === 'cancel') return cancelPhoto(env, userId, replyToken);
    }

    const cmd = parseMessage(text);
    // 主動打「設定」或尚未完成個人化引導 → 開始引導。
    if (cmd.kind === 'settings' || !user.onboarded) {
      return startOnboarding(env, userId, replyToken);
    }

    switch (cmd.kind) {
      case 'log':
        return handleLog(env, user, cmd.items, replyToken);
      case 'today':
        return handleToday(env, user, replyToken);
      case 'savePreset':
        return handleSavePreset(env, user, cmd.label, cmd.calories, replyToken);
      case 'listPresets':
        return handleListPresets(env, user, replyToken);
      case 'deletePreset':
        return handleDeletePreset(env, user, cmd.label, replyToken);
      case 'editFood':
        return handleEditFood(env, user, cmd.index, cmd.calories, replyToken);
      case 'deleteFood':
        return handleDeleteFood(env, user, cmd.index, replyToken);
      case 'listExercise':
        return handleListExercise(env, user, replyToken);
      case 'editExercise':
        return handleEditExercise(env, user, cmd.index, cmd.calories, replyToken);
      case 'deleteExercise':
        return handleDeleteExercise(env, user, cmd.index, replyToken);
      default:
        return replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [helpMessage()]);
    }
  }

  if (message.type === 'image') {
    const user = await ensureUser(env, userId);
    // 未完成個人化引導者,收支卡無法計算,先導引設定 (與文字記錄一致)。
    if (!user.onboarded) return startOnboarding(env, userId, replyToken);
    return handlePhoto(env, user, String(message.id), replyToken);
  }
}
