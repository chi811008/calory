import type { Meal } from '../types';

// 解析使用者在 LINE 打的文字指令。純函式,不碰 IO。
// 支援格式 (Phase 1):
//   餐點: 「午餐 600」「早餐 燕麥 350」「午餐 雞腿便當 750」
//   運動: 「運動 300」「跑步 250」「跑步 操場 250」
//   今日: 「今日」「今天」「進度」

export type ParsedCommand =
  | { kind: 'food'; meal: Meal; calories: number; label?: string }
  | { kind: 'exercise'; calories: number; label?: string }
  | { kind: 'today' }
  | { kind: 'settings' }
  | { kind: 'help' };

const MEAL_KEYWORDS: { re: RegExp; meal: Meal }[] = [
  { re: /^(早餐|早)/, meal: 'breakfast' },
  { re: /^(午餐|中餐|午|中)/, meal: 'lunch' },
  { re: /^(晚餐|晚)/, meal: 'dinner' },
  { re: /^(點心|宵夜|零食|下午茶)/, meal: 'snack' },
];

const EXERCISE_RE = /^(運動|跑步|健走|快走|走路|游泳|騎車|單車|重訓|健身|有氧|跳繩)/;
const TODAY_RE = /^(今日|今天|摘要|統計|進度|查詢)/;
const SETTINGS_RE = /^(設定|重新設定|重設|個人設定|個人化)/;

const NUMBER_RE = /-?\d+(\.\d+)?/;

/** 抽出字串中的第一個數字 (整數或小數)。 */
function extractNumber(s: string): number | null {
  const m = s.match(NUMBER_RE);
  return m ? Number(m[0]) : null;
}

/** 去掉開頭關鍵字與第一個數字,剩下的當作標籤 (例如餐點名稱)。 */
function labelOf(text: string, keywordRe: RegExp): string | undefined {
  const label = text
    .replace(keywordRe, '')
    .replace(NUMBER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return label || undefined;
}

const PHOTO_CANCEL_RE = /^(取消|重拍|不要|算了|cancel)/i;

export type PhotoReply = { kind: 'meal'; meal: Meal } | { kind: 'cancel' } | { kind: 'other' };

/**
 * 解析「pending 照片」進行中時的使用者回覆。
 * - 取消類 → cancel
 * - 含數字 → other (例如「午餐 600」是手動記錄,不該被照片估算劫持)
 * - 純餐別關鍵字 → 指定餐別 (把照片估算記到該餐)
 * - 其餘 → other (落回一般指令)
 */
export function parsePhotoReply(raw: string): PhotoReply {
  const text = raw.trim();
  if (PHOTO_CANCEL_RE.test(text)) return { kind: 'cancel' };
  if (NUMBER_RE.test(text)) return { kind: 'other' };
  for (const { re, meal } of MEAL_KEYWORDS) {
    if (re.test(text)) return { kind: 'meal', meal };
  }
  return { kind: 'other' };
}

export function parseCommand(raw: string): ParsedCommand {
  const text = raw.trim();
  if (!text) return { kind: 'help' };

  if (SETTINGS_RE.test(text)) return { kind: 'settings' };
  if (TODAY_RE.test(text)) return { kind: 'today' };

  const exMatch = text.match(EXERCISE_RE);
  if (exMatch) {
    const calories = extractNumber(text);
    if (calories === null || calories <= 0) return { kind: 'help' };
    // 額外文字優先當標籤;沒有的話,把具體運動動詞 (非通用「運動」) 留作標籤,
    // 讓回覆能顯示「跑步 消耗 250 卡」而非籠統的「運動」。
    const keyword = exMatch[0];
    const extra = labelOf(text, EXERCISE_RE);
    const label = extra ?? (keyword !== '運動' ? keyword : undefined);
    return { kind: 'exercise', calories: Math.round(calories), ...(label ? { label } : {}) };
  }

  for (const { re, meal } of MEAL_KEYWORDS) {
    if (re.test(text)) {
      const calories = extractNumber(text);
      if (calories === null || calories <= 0) return { kind: 'help' };
      const label = labelOf(text, re);
      return { kind: 'food', meal, calories: Math.round(calories), ...(label ? { label } : {}) };
    }
  }

  return { kind: 'help' };
}
