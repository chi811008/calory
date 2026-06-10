// 達標即時驚喜 —— 純函式,讓每天的回饋不再一成不變,並緩解 all-or-nothing 的挫折。
// 全部 deterministic:同一天、同一份數字,結果固定 (方便測試、不花 AI)。

// 達標金句池。依日期輪替,所以連續達標時每天看到的鼓勵都不同。
const PRAISE_POOL = [
  '今天也守住了,身體會記得你的自律 ✨',
  '又一天漂亮達標,持續就是力量 💪',
  '赤字達成!你正在一點一點變好 🌱',
  '穩穩地又是一天,未來的你會感謝現在 🙌',
  '達標到手!自律的人運氣都不會太差 🍀',
  '今天的選擇很棒,明天的你會更輕盈 🎈',
  '又收進一天的努力,複利正在發生 📈',
] as const;

/** 依日期 (YYYY-MM-DD) 從金句池挑一句,同一天固定、每天不同。 */
export function dailyPraise(date: string): string {
  let sum = 0;
  for (let i = 0; i < date.length; i++) sum += date.charCodeAt(i);
  return PRAISE_POOL[sum % PRAISE_POOL.length];
}

// 差一點點就達標的門檻:剩餘 (remaining) 在此值以內給溫和鼓勵,而非冷冰冰的「還差 X 卡」。
export const NEAR_MISS_KCAL = 50;

/** 接近達標 (剩餘 1..NEAR_MISS_KCAL 卡) → 安慰鼓勵句;否則 null。 */
export function nearMissLine(remaining: number): string | null {
  if (remaining > 0 && remaining <= NEAR_MISS_KCAL) {
    return `就差 ${remaining} 卡!走幾步路或少一口就達標,別放棄 🌟`;
  }
  return null;
}

// 超額達標倍數:赤字達到目標的此倍數,跳額外彩蛋獎勵。
const OVER_ACHIEVE_RATIO = 1.5;

/** 超額達標 (赤字 ≥ 目標 × 1.5) → 進階獎勵句;否則 null。 */
export function overAchieveLine(deficit: number, targetDeficit: number): string | null {
  if (targetDeficit > 0 && deficit >= Math.round(targetDeficit * OVER_ACHIEVE_RATIO)) {
    return '🔥 超標達成!今天特別給力,給自己一個讚 💪';
  }
  return null;
}
