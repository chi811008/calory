// 拍照辨識的純函式:把模型輸出正規化成可信的估算,以及 pending 照片的過期判斷。
// 辨識本身交給 Gemini (需要判斷),但這裡 deterministic 地把關界限與型別。

export interface PhotoEstimate {
  label: string;
  calories: number;
}

const MAX_CALORIES = 5000; // 單次一餐的合理上限;超過多半是模型亂猜
const DEFAULT_LABEL = '餐點';

/**
 * 把模型回傳的 JSON 正規化成 PhotoEstimate。
 * 看不出食物 (calories<=0)、超界、非數字、或非物件 → 回 null (視為辨識失敗)。
 */
export function normalizeEstimate(raw: unknown): PhotoEstimate | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const calories = Number(obj.calories);
  if (!Number.isFinite(calories) || calories <= 0 || calories > MAX_CALORIES) return null;

  const labelRaw = typeof obj.label === 'string' ? obj.label.trim() : '';
  return { label: labelRaw || DEFAULT_LABEL, calories: Math.round(calories) };
}

/** pending 照片的有效時間:超過就不該再被後續訊息確認 (避免舊估算劫持)。 */
export const PENDING_PHOTO_TTL_MS = 15 * 60 * 1000;

/** 判斷 pending 照片是否仍在 TTL 內。createdAt 為 D1 datetime('now') 格式 (UTC,空格分隔)。 */
export function isPendingFresh(createdAt: string, now: Date = new Date()): boolean {
  const t = Date.parse(`${createdAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= PENDING_PHOTO_TTL_MS;
}
