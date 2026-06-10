import type { Env, User } from '../types';
import { MEAL_LABELS } from '../types';
import type { LogItem } from '../domain/parse';
import { localDate } from '../domain/date';
import { insertFood, insertExercise, findPreset } from '../db/repo';
import { estimateCaloriesFromText } from '../ai/gemini';
import { computeDaySummary, daySummaryFlex } from './today';
import { replyMessage } from '../line/client';

/**
 * 記錄一批項目 (一則訊息可多筆)。每筆食物的熱量來源依序:
 *   明確數字 → 範本查找 → AI 文字估算;都拿不到就列入「未記錄」明講,不靜默吞掉。
 * 全部寫入後回一則明細 + 當日收支卡。
 */
export async function handleLog(
  env: Env,
  user: User,
  items: LogItem[],
  replyToken: string,
): Promise<void> {
  const date = localDate(user.tz);
  const recorded: string[] = [];
  const unrecorded: string[] = [];

  for (const item of items) {
    if (item.type === 'exercise') {
      if (item.calories === null) {
        unrecorded.push(`${item.label ?? '運動'}（沒給消耗卡數）`);
        continue;
      }
      await insertExercise(env, user.lineUserId, date, item.calories, item.label);
      recorded.push(`🏃 ${item.label ?? '運動'} 消耗 ${item.calories} 卡`);
      continue;
    }

    // 食物:解析出熱量與來源。
    let calories = item.calories;
    let mark = '';
    let source = 'manual';
    if (calories === null) {
      const label = item.label?.trim();
      if (!label) continue; // 既無名稱也無數字,跳過 (理論上 parse 已濾掉)
      const preset = await findPreset(env, user.lineUserId, label);
      if (preset) {
        calories = preset.calories;
        source = 'preset';
        mark = ' 📒範本';
      } else {
        const est = await estimateCaloriesFromText(env.GEMINI_API_KEY, label);
        if (est) {
          calories = est.calories;
          source = 'estimate';
          mark = ' 🤖估算';
        } else {
          unrecorded.push(label);
          continue;
        }
      }
    }

    await insertFood(env, user.lineUserId, date, item.meal, calories, item.label, source);
    const name = item.label ? `${MEAL_LABELS[item.meal]}・${item.label}` : MEAL_LABELS[item.meal];
    const defaultMark = item.defaulted ? '（未指定餐別→點心）' : '';
    recorded.push(`${name} ${calories} 卡${mark}${defaultMark}`);
  }

  const lines: string[] = [];
  if (recorded.length > 0) {
    lines.push(`✅ 已記錄 ${recorded.length} 筆`, ...recorded);
  }
  if (unrecorded.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(
      `⚠️ 這 ${unrecorded.length} 樣沒記到 (請補上熱量數字,例如「${unrecorded[0]} 300」)：`,
      ...unrecorded.map((u) => `・${u}`),
    );
  }
  if (recorded.some((r) => r.includes('🤖估算'))) {
    lines.push('', '🤖 為估算值,可用「改 N 數字」修正 (打「今日」看編號)');
  }

  const detailMsg = { type: 'text', text: lines.join('\n') };
  const summary = await computeDaySummary(env, user, date, false);
  const flex = daySummaryFlex('今日進度', user, summary, env.LIFF_URL);
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [detailMsg, flex]);
}
