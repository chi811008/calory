// 日期 / 時區工具。日期一律以使用者當地時區的 YYYY-MM-DD 表示。

/** 取得指定時區「今天」的 YYYY-MM-DD。 */
export function localDate(tz: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // en-CA → YYYY-MM-DD
}

/** 在 YYYY-MM-DD 上加減天數,回傳新的 YYYY-MM-DD。 */
export function addDays(date: string, delta: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export interface LocalParts {
  date: string; // 當地 YYYY-MM-DD
  hour: number; // 當地小時 0–23
  weekday: string; // 當地星期 'Mon'..'Sun'
}

/**
 * 指定時區「此刻」的日期/小時/星期。
 * 排程推播 (cron 以 UTC 整點觸發) 靠這個換算成使用者當地時間來決定要不要推。
 */
export function localParts(tz: string, now: Date = new Date()): LocalParts {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(
      now,
    ),
  );
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  return { date: localDate(tz, now), hour, weekday };
}
