import type { Env, User } from '../types';
import { ensureUser, getOnboarding, getPendingPhoto } from '../db/repo';
import { parseMessage, parsePhotoReply, type ParsedMessage } from '../domain/parse';
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
import { handleSetGoal, handleShowGoal } from '../handlers/goal';
import { handleSetWeight, handleShowWeight, handleDeleteWeight } from '../handlers/weight';
import { startOnboarding, handleOnboarding } from '../handlers/onboarding';
import {
  handlePhoto,
  estimateAndReview,
  askMeal,
  confirmPhoto,
  cancelPhoto,
} from '../handlers/photo';
import { replyMessage } from './client';
import { helpMessage } from './flex';

// 可分派的指令 kind:'settings' 在 switch 前已先攔截 (開始引導),故排除。
type DispatchKind = Exclude<ParsedMessage['kind'], 'settings'>;
type CommandHandler<K extends DispatchKind> = (
  env: Env,
  user: User,
  cmd: Extract<ParsedMessage, { kind: K }>,
  replyToken: string,
) => Promise<void>;

// 指令分派表。每個 kind 對應一個處理器,cmd 已依 kind 收斂為精確型別。
// 新增 ParsedMessage 的 kind 時,此處會因型別不完整而編譯失敗 —— 等同 switch 的窮舉檢查。
const COMMAND_HANDLERS: { [K in DispatchKind]: CommandHandler<K> } = {
  log: (env, user, cmd, token) => handleLog(env, user, cmd.items, token),
  today: (env, user, _cmd, token) => handleToday(env, user, token),
  help: (env, _user, _cmd, token) =>
    replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, token, [helpMessage()]),
  savePreset: (env, user, cmd, token) =>
    handleSavePreset(env, user, cmd.label, cmd.calories, token),
  listPresets: (env, user, _cmd, token) => handleListPresets(env, user, token),
  deletePreset: (env, user, cmd, token) => handleDeletePreset(env, user, cmd.label, token),
  editFood: (env, user, cmd, token) => handleEditFood(env, user, cmd.index, cmd.calories, token),
  deleteFood: (env, user, cmd, token) => handleDeleteFood(env, user, cmd.index, token),
  listExercise: (env, user, _cmd, token) => handleListExercise(env, user, token),
  editExercise: (env, user, cmd, token) =>
    handleEditExercise(env, user, cmd.index, cmd.calories, token),
  deleteExercise: (env, user, cmd, token) => handleDeleteExercise(env, user, cmd.index, token),
  setGoal: (env, user, cmd, token) => handleSetGoal(env, user, cmd.goalKg, token),
  showGoal: (env, user, _cmd, token) => handleShowGoal(env, user, token),
  setWeight: (env, user, cmd, token) => handleSetWeight(env, user, cmd.weightKg, token),
  showWeight: (env, user, _cmd, token) => handleShowWeight(env, user, token),
  deleteWeight: (env, user, cmd, token) =>
    handleDeleteWeight(env, user, cmd.month, cmd.day, token),
};

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

    // 有「新鮮的」待確認照片:依對話階段判讀回覆 (補充/直接估算/儲存/選餐別/放棄)。
    // 只有「放棄」與各階段按鈕是特殊指令,其餘自由文字一律當描述補充;'other' 才落回一般指令。
    const pending = await getPendingPhoto(env, userId);
    if (pending && isPendingFresh(pending.createdAt)) {
      const reply = parsePhotoReply(text, pending.phase);
      switch (reply.kind) {
        case 'cancel':
          return cancelPhoto(env, userId, replyToken);
        case 'estimateNow':
          return estimateAndReview(env, user, pending, null, replyToken);
        case 'describe':
          return estimateAndReview(env, user, pending, reply.text, replyToken);
        case 'save':
          return askMeal(env, user, pending, replyToken);
        case 'meal':
          if (pending.estimate) {
            return confirmPhoto(env, user, pending.estimate, reply.meal, replyToken);
          }
          break; // 估算遺失 (不應發生),落回一般指令
        case 'other':
          break; // 落回一般指令解析
      }
    }

    const cmd = parseMessage(text);
    // 主動打「設定」或尚未完成個人化引導 → 開始引導。
    if (cmd.kind === 'settings' || !user.onboarded) {
      return startOnboarding(env, userId, replyToken);
    }

    // 從分派表取出處理器。cmd.kind 與 cmd 的關聯型別 TS 無法自動收斂
    // (correlated union 限制),故在此單一邊界做一次轉型;分派表本身仍是型別安全且窮舉的。
    const handler = COMMAND_HANDLERS[cmd.kind] as CommandHandler<DispatchKind>;
    return handler(env, user, cmd, replyToken);
  }

  if (message.type === 'image') {
    const user = await ensureUser(env, userId);
    // 未完成個人化引導者,收支卡無法計算,先導引設定 (與文字記錄一致)。
    if (!user.onboarded) return startOnboarding(env, userId, replyToken);
    return handlePhoto(env, user, String(message.id), replyToken);
  }
}
