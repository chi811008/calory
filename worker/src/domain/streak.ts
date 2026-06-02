// 連續達標天數與里程碑徽章 —— 遊戲化的「不想斷連」動力來源。

export interface DayMet {
  date: string; // YYYY-MM-DD
  met: boolean;
}

/**
 * 連續達標天數:從最近一天往回數,遇到第一個未達標即停止。
 * 輸入需依日期「升冪」排序 (舊 → 新)。
 */
export function currentStreak(days: DayMet[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].met) streak++;
    else break;
  }
  return streak;
}

const MILESTONES = [30, 14, 7, 3] as const;

/**
 * 恰好踩到里程碑當天回傳徽章字串,否則回 null。
 * 用「恰好等於」是為了讓徽章只在達成那天宣告一次,不會每天重複洗。
 */
export function streakBadge(streak: number): string | null {
  for (const m of MILESTONES) {
    if (streak === m) return `🏅 連續達標 ${m} 天!`;
  }
  return null;
}
