import type { Sex } from '../types';
import { ACTIVITY_FACTORS, tdee } from './tdee';

// 個人化設定引導的狀態機 —— 全為純函式,不碰 IO。
// 逐步問答:性別 → 年齡 → 身高 → 體重 → 活動量 → 目標赤字 → 睡前時間 → 算 TDEE。
// 草稿 (OnboardingDraft) 即是唯一狀態來源;當前步驟由「第一個還沒填的欄位」推導,
// 不另存 step,避免 step 與已填欄位不一致。

export type OnboardingStep =
  | 'sex'
  | 'age'
  | 'heightCm'
  | 'weightKg'
  | 'activityFactor'
  | 'targetDeficit'
  | 'bedtimeHour';

/** 提問順序。nextStep 依此推進,順序需與 finalize 需要的欄位一致。 */
export const STEP_ORDER: OnboardingStep[] = [
  'sex',
  'age',
  'heightCm',
  'weightKg',
  'activityFactor',
  'targetDeficit',
  'bedtimeHour',
];

export interface OnboardingDraft {
  sex?: Sex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activityFactor?: number;
  targetDeficit?: number;
  bedtimeHour?: number;
}

/** 引導完成後要寫回 users 的個人化設定 (含算好的 TDEE)。 */
export interface OnboardingSettings {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityFactor: number;
  tdee: number;
  targetDeficit: number;
  bedtimeHour: number;
}

export type AnswerResult = { ok: true; value: Sex | number } | { ok: false; error: string };

/** 當前該問的步驟 = 第一個還沒填的欄位;全部填完回 null。 */
export function nextStep(draft: OnboardingDraft): OnboardingStep | null {
  for (const step of STEP_ORDER) {
    if (draft[step] === undefined) return step;
  }
  return null;
}

// 數值欄位的合理範圍。超出視為輸入錯誤 (fail loud),重問而非吞掉。
const RANGES = {
  age: { min: 10, max: 100, unit: '歲' },
  heightCm: { min: 100, max: 250, unit: '公分' },
  weightKg: { min: 30, max: 300, unit: '公斤' },
  targetDeficit: { min: 0, max: 1500, unit: '卡' },
  bedtimeHour: { min: 0, max: 23, unit: '點' },
} as const;

type RangedStep = keyof typeof RANGES;

// 四捨五入成整數的欄位 (年齡/赤字/睡前時間);身高體重保留小數。
const INTEGER_STEPS = new Set<RangedStep>(['age', 'targetDeficit', 'bedtimeHour']);

const NUMBER_RE = /-?\d+(\.\d+)?/;

type NumResult = { ok: true; value: number } | { ok: false; error: string };

function parseSex(raw: string): AnswerResult {
  const t = raw.trim().toLowerCase();
  if (/^(男|male|m|boy)/.test(t)) return { ok: true, value: 'male' };
  if (/^(女|female|f|girl)/.test(t)) return { ok: true, value: 'female' };
  return { ok: false, error: '請選擇「男」或「女」' };
}

function parseActivity(raw: string): AnswerResult {
  const t = raw.trim().toLowerCase();
  if (/^(久坐|sedentary)/.test(t)) return { ok: true, value: ACTIVITY_FACTORS.sedentary };
  if (/^(輕度|輕|light)/.test(t)) return { ok: true, value: ACTIVITY_FACTORS.light };
  // WHY: 只支援久坐/輕度 —— 運動另外記錄並加總,放行更高係數會把運動重複算進去。
  return { ok: false, error: '請選擇「久坐」或「輕度」' };
}

function parseRanged(raw: string, step: RangedStep): NumResult {
  const m = raw.match(NUMBER_RE);
  const r = RANGES[step];
  if (!m) return { ok: false, error: `請輸入數字 (${r.min}–${r.max} ${r.unit})` };
  const n = Number(m[0]);
  if (n < r.min || n > r.max) {
    return { ok: false, error: `請輸入 ${r.min}–${r.max} ${r.unit}之間的數字` };
  }
  return { ok: true, value: INTEGER_STEPS.has(step) ? Math.round(n) : n };
}

/** 驗證 + 解析單一步驟的使用者回覆。不前進草稿,只負責「這個答案合不合法」。 */
export function applyAnswer(step: OnboardingStep, raw: string): AnswerResult {
  switch (step) {
    case 'sex':
      return parseSex(raw);
    case 'activityFactor':
      return parseActivity(raw);
    case 'age':
    case 'heightCm':
    case 'weightKg':
    case 'targetDeficit':
    case 'bedtimeHour':
      return parseRanged(raw, step);
  }
}

/** 套用答案到草稿:成功回傳新草稿 (不可變),失敗回錯誤訊息、草稿不變。 */
export function advance(
  draft: OnboardingDraft,
  step: OnboardingStep,
  raw: string,
): { ok: true; draft: OnboardingDraft } | { ok: false; error: string } {
  const r = applyAnswer(step, raw);
  if (!r.ok) return r;
  // applyAnswer 已保證 value 型別與 step 對應 (sex→Sex,其餘→number),此處集中處理動態鍵。
  return { ok: true, draft: { ...draft, [step]: r.value } as OnboardingDraft };
}

/** 草稿填滿後算出 TDEE 並組出要落地的設定。缺值即擲錯,絕不寫入半套設定。 */
export function finalize(draft: OnboardingDraft): OnboardingSettings {
  if (nextStep(draft) !== null) {
    throw new Error('onboarding draft incomplete');
  }
  const sex = draft.sex!;
  const age = draft.age!;
  const heightCm = draft.heightCm!;
  const weightKg = draft.weightKg!;
  const activityFactor = draft.activityFactor!;
  return {
    sex,
    age,
    heightCm,
    weightKg,
    activityFactor,
    tdee: tdee(sex, weightKg, heightCm, age, activityFactor),
    targetDeficit: draft.targetDeficit!,
    bedtimeHour: draft.bedtimeHour!,
  };
}
