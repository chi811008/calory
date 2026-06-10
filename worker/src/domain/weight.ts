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
  remainingKcal: number; // 距離「下一公斤」還差幾卡 (僅減重方向有意義)
}

/** 把累積淨赤字換算成公斤與距離下一公斤的剩餘卡數。 */
export function weightProgress(netDeficit: number): WeightProgress {
  const kg = netDeficit / KCAL_PER_KG;
  // 取「進入當前這一公斤」已累積多少 (0..7699),反推還差多少到下一公斤。
  const within = ((netDeficit % KCAL_PER_KG) + KCAL_PER_KG) % KCAL_PER_KG;
  const remainingKcal = within === 0 ? 0 : KCAL_PER_KG - within;
  return { kg, remainingKcal };
}
