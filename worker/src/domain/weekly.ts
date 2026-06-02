import { computeDay } from './calories';
import type { DayTotals } from '../db/repo';

// 週報聚合 —— 純函式。輸入是上週「有記錄」的每日攝取/運動,用同一套 computeDay
// 算每日達標與赤字,確保週報數字與每日卡一致。

export interface WeekSummary {
  daysLogged: number; // 有記錄的天數
  daysMet: number; // 達標天數
  avgIntake: number; // 有記錄日的平均攝取 (四捨五入)
  totalDeficit: number; // 週赤字總計 (負值代表整體吃超標)
}

export function summarizeWeek(
  days: DayTotals[],
  tdee: number,
  targetDeficit: number,
): WeekSummary {
  if (days.length === 0) {
    return { daysLogged: 0, daysMet: 0, avgIntake: 0, totalDeficit: 0 };
  }

  let daysMet = 0;
  let totalIntake = 0;
  let totalDeficit = 0;
  for (const d of days) {
    const r = computeDay({ tdee, intake: d.intake, exerciseBurn: d.burn, targetDeficit });
    if (r.met) daysMet += 1;
    totalIntake += d.intake;
    totalDeficit += r.deficit;
  }

  return {
    daysLogged: days.length,
    daysMet,
    avgIntake: Math.round(totalIntake / days.length),
    totalDeficit,
  };
}
