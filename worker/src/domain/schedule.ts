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
