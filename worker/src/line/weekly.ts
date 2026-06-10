import type { WeekSummary } from '../domain/weekly';
import { KCAL_PER_KG } from '../domain/weight';

/** 週報文字訊息。涵蓋區間 [from, to] 為使用者當地日期。 */
export function weeklyMessage(summary: WeekSummary, from: string, to: string): object {
  const kg = summary.totalDeficit / KCAL_PER_KG;
  const direction = kg >= 0 ? '減' : '增';
  const weightLine = `預估體重：約${direction} ${Math.abs(kg).toFixed(2)} 公斤`;
  const cheer = summary.daysMet >= 5 ? '表現超棒，繼續保持 💪' : '新的一週再加油 🔥';

  return {
    type: 'text',
    text: [
      `📅 上週總結 (${from} ~ ${to})`,
      '',
      `記錄天數：${summary.daysLogged} / 7 天`,
      `達標天數：${summary.daysMet} 天`,
      `平均攝取：${summary.avgIntake} 卡 / 天`,
      `週赤字總計：${summary.totalDeficit} 卡`,
      weightLine,
      '',
      cheer,
    ].join('\n'),
  };
}
