import type { Meal } from '../types';

// 解析使用者在 LINE 打的文字指令。純函式,不碰 IO。
//
// 兩類訊息:
//  A. 控制指令 (單行語意):今日/設定/範本/存/刪範本/改 N/刪 N。
//  B. 記錄批次 (可多行):逐行解析,沿用「當前餐別」狀態,一則訊息可記多筆。
//
// 支援格式:
//   記錄: 「午餐 600」「早餐 燕麥 350」;多行則每行一筆,沒餐別關鍵字的行延續上一個餐別。
//   運動: 「運動 300」「跑步 250」
//   範本: 「存 滷肉飯小碗 450」「範本」「刪範本 滷肉飯小碗」
//   修改: 「改 2 500」「刪 3」(N 為「今日」清單的食物序號)
//   今日: 「今日」「進度」  設定: 「設定」

export interface FoodItem {
  type: 'food';
  meal: Meal;
  calories: number | null; // null = 沒給數字,留待範本查找 / AI 估算
  label: string | null;
  defaulted?: boolean; // true = 沒指定餐別,被預設歸到 snack
}

export interface ExerciseItem {
  type: 'exercise';
  calories: number | null; // null = 沒給消耗卡數 (運動不做估算,handler 會回報未記錄)
  label: string | null;
}

export type LogItem = FoodItem | ExerciseItem;

export type ParsedMessage =
  | { kind: 'today' }
  | { kind: 'settings' }
  | { kind: 'help' }
  | { kind: 'listPresets' }
  | { kind: 'savePreset'; label: string; calories: number }
  | { kind: 'deletePreset'; label: string }
  | { kind: 'editFood'; index: number; calories: number }
  | { kind: 'deleteFood'; index: number }
  | { kind: 'listExercise' }
  | { kind: 'editExercise'; index: number; calories: number }
  | { kind: 'deleteExercise'; index: number }
  | { kind: 'setGoal'; goalKg: number }
  | { kind: 'showGoal' }
  | { kind: 'setWeight'; weightKg: number }
  | { kind: 'showWeight' }
  | { kind: 'log'; items: LogItem[] };

const MEAL_KEYWORDS: { re: RegExp; meal: Meal }[] = [
  { re: /^(早餐|早)/, meal: 'breakfast' },
  // 單字只留 早/午/晚;不收單字「中」,否則「中杯/中份…」開頭的延續行會被誤判成午餐。
  { re: /^(午餐|中餐|午)/, meal: 'lunch' },
  { re: /^(晚餐|晚)/, meal: 'dinner' },
  { re: /^(點心|宵夜|零食|下午茶)/, meal: 'snack' },
  { re: /^(飲料|飲品|手搖杯|手搖)/, meal: 'drink' },
];

const EXERCISE_RE = /^(運動|跑步|健走|快走|走路|游泳|騎車|單車|重訓|健身|有氧|跳繩)/;
const TODAY_RE = /^(今日|今天|摘要|統計|進度|查詢)$/;
const SETTINGS_RE = /^(設定|重新設定|重設|個人設定|個人化)$/;

// 控制指令 (整則訊息為單行時才判)。
const LIST_PRESETS_RE = /^(範本|我的食物|食物範本)$/;
const SAVE_PRESET_RE = /^存\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/;
const DELETE_PRESET_RE = /^刪範本\s+(.+?)\s*$/;
const EDIT_FOOD_RE = /^改\s+(\d+)\s+(\d+(?:\.\d+)?)\s*$/;
const DELETE_FOOD_RE = /^刪\s+(\d+)\s*$/;
const LIST_EXERCISE_RE = /^(運動清單|運動列表|運動記錄|運動紀錄)$/;
const EDIT_EXERCISE_RE = /^改運動\s+(\d+)\s+(\d+(?:\.\d+)?)\s*$/;
const DELETE_EXERCISE_RE = /^刪運動\s+(\d+)\s*$/;
// 減重目標:「目標 4 公斤」「目標4」「目標 4 kg」皆可;單獨「目標」查詢目前設定。
const SET_GOAL_RE = /^目標\s*(\d+(?:\.\d+)?)\s*(?:公斤|kg)?\s*$/i;
const SHOW_GOAL_RE = /^目標$/;
// 體重:「體重 70」「體重70.5」「體重 70 公斤/kg」皆可;單獨「體重」查最近一次。
const SET_WEIGHT_RE = /^體重\s*(\d+(?:\.\d+)?)\s*(?:公斤|kg)?\s*$/i;
const SHOW_WEIGHT_RE = /^體重$/;

const NUMBER_RE = /-?\d+(\.\d+)?/;

/** 抽出字串中的第一個數字 (整數或小數)。 */
function extractNumber(s: string): number | null {
  const m = s.match(NUMBER_RE);
  return m ? Number(m[0]) : null;
}

/** 去掉開頭關鍵字與第一個數字,剩下的當作標籤 (例如餐點名稱)。 */
function labelOf(text: string, keywordRe: RegExp | null): string | undefined {
  let s = text;
  if (keywordRe) s = s.replace(keywordRe, '');
  const label = s
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

/** 解析單行為一筆 LogItem;只設定餐別 (如純「午餐」) 或空行回 null。currentMeal 由呼叫端維護。 */
function parseLine(line: string, currentMeal: Meal | null): LogItem | null {
  const text = line.trim();
  if (!text) return null;

  // 運動行:消耗卡數可缺 (null → handler 回報未記錄,運動不做估算)。
  const exMatch = text.match(EXERCISE_RE);
  if (exMatch) {
    const calories = extractNumber(text);
    const keyword = exMatch[0];
    const extra = labelOf(text, EXERCISE_RE);
    const label = extra ?? (keyword !== '運動' ? keyword : null);
    return {
      type: 'exercise',
      calories: calories !== null && calories > 0 ? Math.round(calories) : null,
      label,
    };
  }

  // 餐別行:設定當前餐別,該行剩餘若有內容 (名稱/數字) 也算一筆。
  for (const { re, meal } of MEAL_KEYWORDS) {
    if (re.test(text)) {
      const calories = extractNumber(text);
      const label = labelOf(text, re) ?? null;
      if (calories === null && label === null) return null; // 純餐別關鍵字,只設定餐別
      return {
        type: 'food',
        meal,
        calories: calories !== null && calories > 0 ? Math.round(calories) : null,
        label,
      };
    }
  }

  // 無關鍵字:延續當前餐別,沒有則預設 snack 並標記。
  const calories = extractNumber(text);
  const label = labelOf(text, null) ?? null;
  if (calories === null && label === null) return null;
  // 無數字且無餐別脈絡 → 視為非記錄 (例如「哈囉」),交給 help;
  // 有數字 (如「燕麥 200」) 或在餐別標題行底下 (延續) 才當成一筆。
  if (calories === null && currentMeal === null) return null;
  const meal = currentMeal ?? 'snack';
  const item: FoodItem = {
    type: 'food',
    meal,
    calories: calories !== null && calories > 0 ? Math.round(calories) : null,
    label,
  };
  if (currentMeal === null) item.defaulted = true;
  return item;
}

/** 解析一則 (可多行) 訊息為控制指令或記錄批次。 */
export function parseMessage(raw: string): ParsedMessage {
  const text = raw.trim();
  if (!text) return { kind: 'help' };

  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // 控制指令只在單行訊息成立 (多行視為記錄批次)。
  if (lines.length === 1) {
    const one = lines[0];
    if (SETTINGS_RE.test(one)) return { kind: 'settings' };
    if (TODAY_RE.test(one)) return { kind: 'today' };
    if (LIST_PRESETS_RE.test(one)) return { kind: 'listPresets' };

    const dp = one.match(DELETE_PRESET_RE);
    if (dp) return { kind: 'deletePreset', label: dp[1].trim() };

    const sp = one.match(SAVE_PRESET_RE);
    if (sp) {
      const calories = Math.round(Number(sp[2]));
      if (calories > 0) return { kind: 'savePreset', label: sp[1].trim(), calories };
    }

    const ed = one.match(EDIT_FOOD_RE);
    if (ed) {
      const index = Number(ed[1]);
      const calories = Math.round(Number(ed[2]));
      if (index > 0 && calories > 0) return { kind: 'editFood', index, calories };
    }

    const del = one.match(DELETE_FOOD_RE);
    if (del) {
      const index = Number(del[1]);
      if (index > 0) return { kind: 'deleteFood', index };
    }

    if (LIST_EXERCISE_RE.test(one)) return { kind: 'listExercise' };

    const ee = one.match(EDIT_EXERCISE_RE);
    if (ee) {
      const index = Number(ee[1]);
      const calories = Math.round(Number(ee[2]));
      if (index > 0 && calories > 0) return { kind: 'editExercise', index, calories };
    }

    const de = one.match(DELETE_EXERCISE_RE);
    if (de) {
      const index = Number(de[1]);
      if (index > 0) return { kind: 'deleteExercise', index };
    }

    if (SHOW_GOAL_RE.test(one)) return { kind: 'showGoal' };
    const sg = one.match(SET_GOAL_RE);
    if (sg) {
      const goalKg = Math.round(Number(sg[1]));
      if (goalKg > 0) return { kind: 'setGoal', goalKg };
    }

    if (SHOW_WEIGHT_RE.test(one)) return { kind: 'showWeight' };
    const sw = one.match(SET_WEIGHT_RE);
    if (sw) {
      const weightKg = Number(sw[1]);
      if (weightKg > 0) return { kind: 'setWeight', weightKg };
    }
  }

  // 記錄批次:逐行解析,沿用當前餐別。
  const items: LogItem[] = [];
  let currentMeal: Meal | null = null;
  for (const line of lines) {
    const item = parseLine(line, currentMeal);
    // 餐別行 (即使只設定餐別、未產生 item) 也要更新 currentMeal。
    for (const { re, meal } of MEAL_KEYWORDS) {
      if (re.test(line)) {
        currentMeal = meal;
        break;
      }
    }
    if (item) items.push(item);
  }

  if (items.length === 0) return { kind: 'help' };
  return { kind: 'log', items };
}
