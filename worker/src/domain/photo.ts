// 拍照辨識的純函式:把模型輸出正規化成可信的估算,以及 pending 照片的過期判斷。
// 辨識本身交給 Gemini (需要判斷),但這裡 deterministic 地把關界限與型別。

// pending 照片的對話階段:
//  describe — 剛收到照片,等使用者補充描述或按「直接估算」(此時還沒呼叫模型)。
//  review   — 已估算,等使用者「儲存」或繼續補充描述 (再估)。
//  meal     — 使用者已選擇儲存,等選餐別。
export type PhotoPhase = 'describe' | 'review' | 'meal';

export interface PhotoItem {
  label: string;
  grams: number;
  calories: number;
}

export interface PhotoEstimate {
  label: string;
  calories: number;
  items?: PhotoItem[]; // 分項明細 (照片估算才有;文字/舊格式沒有)
}

const MAX_CALORIES = 5000; // 單次一餐的合理上限;超過多半是模型亂猜
const DEFAULT_LABEL = '餐點';
const ITEM_LABEL = '項目';

/** 正規化單一明細項;calories 不合理 (非數字/<=0/超界) 視為無效回 null,grams 無效則歸 0。 */
function normalizeItem(raw: unknown): PhotoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const calories = Number(obj.calories);
  if (!Number.isFinite(calories) || calories <= 0 || calories > MAX_CALORIES) return null;

  const grams = Number(obj.grams);
  const safeGrams = Number.isFinite(grams) && grams > 0 ? Math.round(grams) : 0;
  const labelRaw = typeof obj.label === 'string' ? obj.label.trim() : '';
  return { label: labelRaw || ITEM_LABEL, grams: safeGrams, calories: Math.round(calories) };
}

/**
 * 把模型回傳的 JSON 正規化成 PhotoEstimate。
 *
 * 兩種輸入:
 * - 分項格式 {label, items:[...]} → 過濾無效項,總熱量由程式加總 (不信模型自報)。
 * - 舊單值格式 {label, calories} → 沿用 (文字估算與舊 pending)。
 *
 * 任何情形下總熱量 <=0 / 超界 / 無有效資料 → 回 null (視為辨識失敗)。
 */
export function normalizeEstimate(raw: unknown): PhotoEstimate | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const labelRaw = typeof obj.label === 'string' ? obj.label.trim() : '';
  const label = labelRaw || DEFAULT_LABEL;

  if (Array.isArray(obj.items)) {
    const items = obj.items.map(normalizeItem).filter((i): i is PhotoItem => i !== null);
    if (items.length === 0) return null;
    const calories = items.reduce((sum, i) => sum + i.calories, 0);
    if (calories <= 0 || calories > MAX_CALORIES) return null;
    return { label, calories, items };
  }

  const calories = Number(obj.calories);
  if (!Number.isFinite(calories) || calories <= 0 || calories > MAX_CALORIES) return null;
  return { label, calories: Math.round(calories) };
}

/** pending 照片的有效時間:超過就不該再被後續訊息確認 (避免舊估算劫持)。 */
export const PENDING_PHOTO_TTL_MS = 15 * 60 * 1000;

/** 判斷 pending 照片是否仍在 TTL 內。createdAt 為 D1 datetime('now') 格式 (UTC,空格分隔)。 */
export function isPendingFresh(createdAt: string, now: Date = new Date()): boolean {
  const t = Date.parse(`${createdAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= PENDING_PHOTO_TTL_MS;
}
