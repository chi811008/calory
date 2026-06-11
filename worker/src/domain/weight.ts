// 體重換算 —— 純函式。把累積熱量赤字換成「減了幾公斤」與「距離下一公斤」的終點線。

export const KCAL_PER_KG = 7700; // 每累積約 7700 卡 ≈ 體重 1 公斤

/**
 * 全程淨赤字 = tdee × 有記錄天數 + 總運動消耗 − 總攝取。
 * 每個有記錄日計一次基礎消耗 (tdee 為久坐基礎,運動另外加),與每日卡/週報同一套帳。
 */
export function cumulativeNetDeficit(
  tdee: number,
  daysLogged: number,
  totalIntake: number,
  totalBurn: number,
): number {
  return Math.round(tdee * daysLogged + totalBurn - totalIntake);
}

export interface WeightProgress {
  kg: number; // 體重變化:正=減重,負=增重
  withinKcal: number; // 進入「當前這一公斤」已累積幾卡 (0..7699),供進度條填滿比例
  remainingKcal: number; // 距離「下一公斤」還差幾卡 (僅減重方向有意義)
}

/** 把累積淨赤字換算成公斤、當前公斤已走的卡數,與距離下一公斤的剩餘卡數。 */
export function weightProgress(netDeficit: number): WeightProgress {
  const kg = netDeficit / KCAL_PER_KG;
  // 取「進入當前這一公斤」已累積多少 (0..7699),反推還差多少到下一公斤。
  const within = ((netDeficit % KCAL_PER_KG) + KCAL_PER_KG) % KCAL_PER_KG;
  const remainingKcal = within === 0 ? 0 : KCAL_PER_KG - within;
  return { kg, withinKcal: within, remainingKcal };
}

/**
 * 把「已減公斤數」分配成 goalKg 顆愛心的填滿比例 (各 0..1)。
 * 第 i 顆 (0-indexed) 填滿比例 = clamp(lostKg − i, 0, 1):
 * 愛心一顆一顆依序填滿;吃超標使 lostKg 下降時,對應愛心比例自動退回。
 * lostKg ≤ 0 (尚無進度或淨增重) → 全部 0。
 */
export function heartFills(lostKg: number, goalKg: number): number[] {
  const fills: number[] = [];
  for (let i = 0; i < goalKg; i++) {
    fills.push(Math.max(0, Math.min(1, lostKg - i)));
  }
  return fills;
}
