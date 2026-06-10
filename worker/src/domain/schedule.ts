// 排程推播的觸發判斷 —— 純函式。時機一律以使用者「當地時間」為準 (見 date.localParts)。

export type NotifyKind = 'bedtime' | 'daily' | 'weekly';

/** 日報推播的當地時間 (早上,總結昨日)。 */
export const DAILY_REPORT_HOUR = 8;
/** 週報推播的當地星期與時間 (週一早上,總結上週)。 */
export const WEEKLY_REPORT_WEEKDAY = 'Mon';
export const WEEKLY_REPORT_HOUR = 8;

/**
 * 在這個當地時間,該使用者有哪些推播到期。
 * cron 每小時觸發一次,以「小時相等」判斷,確保每種每天恰好觸發一次。
 */
/**
 * 「結算」判斷:當天吃完、可以對達標下定論的時點。
 * - closed=true:已收盤的過去日 (如昨日總結),直接視為結算。
 * - 否則看當地時間是否已過晚餐 —— 以就寢前 1 小時為界。
 * 進行中 (未結算) 時不該慶祝達標,因為赤字只會隨進食變小,早上「達標」只代表還沒吃夠。
 */
export function isDaySettled(closed: boolean, localHour: number, bedtimeHour: number): boolean {
  return closed || localHour >= bedtimeHour - 1;
}

export function dueNotifications(
  bedtimeHour: number,
  parts: { hour: number; weekday: string },
): NotifyKind[] {
  const due: NotifyKind[] = [];
  if (parts.hour === bedtimeHour) due.push('bedtime');
  if (parts.hour === DAILY_REPORT_HOUR) due.push('daily');
  if (parts.weekday === WEEKLY_REPORT_WEEKDAY && parts.hour === WEEKLY_REPORT_HOUR) {
    due.push('weekly');
  }
  return due;
}
