import type { Env, User } from '../types';
import { savePreset, listPresets, deletePreset } from '../db/repo';
import { replyMessage } from '../line/client';

function text(token: string, env: Env, body: string): Promise<void> {
  return replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, token, [{ type: 'text', text: body }]);
}

/** 「存 <名> <卡>」:存/覆蓋一筆食物範本。 */
export async function handleSavePreset(
  env: Env,
  user: User,
  label: string,
  calories: number,
  replyToken: string,
): Promise<void> {
  await savePreset(env, user.lineUserId, label, calories);
  await text(
    replyToken,
    env,
    `📒 已存範本「${label}」= ${calories} 卡\n之後打「午餐 ${label}」就會直接記這個熱量`,
  );
}

/** 「範本」:列出已存的食物範本。 */
export async function handleListPresets(
  env: Env,
  user: User,
  replyToken: string,
): Promise<void> {
  const presets = await listPresets(env, user.lineUserId);
  if (presets.length === 0) {
    await text(replyToken, env, '你還沒有食物範本。\n打「存 滷肉飯小碗 450」就能存第一筆 📒');
    return;
  }
  const lines = ['📒 你的食物範本', ...presets.map((p) => `・${p.label} = ${p.calories} 卡`)];
  await text(replyToken, env, lines.join('\n'));
}

/** 「刪範本 <名>」:刪除一筆範本。 */
export async function handleDeletePreset(
  env: Env,
  user: User,
  label: string,
  replyToken: string,
): Promise<void> {
  const deleted = await deletePreset(env, user.lineUserId, label);
  await text(
    replyToken,
    env,
    deleted ? `🗑️ 已刪除範本「${label}」` : `找不到範本「${label}」,打「範本」看現有清單`,
  );
}
