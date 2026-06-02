import { describe, it, expect } from 'vitest';
import {
  dueNotifications,
  DAILY_REPORT_HOUR,
  WEEKLY_REPORT_HOUR,
  WEEKLY_REPORT_WEEKDAY,
} from '../src/domain/schedule';
import { summarizeWeek } from '../src/domain/weekly';
import { localParts } from '../src/domain/date';

describe('localParts', () => {
  it('依時區換算當地日期/小時/星期 (台北 +8 跨日跨週)', () => {
    // WHY: cron 以 UTC 整點觸發,推播時機必須用「使用者當地時間」判斷,否則會推錯時間。
    // 2026-05-31T20:00Z → 台北 2026-06-01 04:00,且 2026-06-01 是週一。
    const p = localParts('Asia/Taipei', new Date('2026-05-31T20:00:00Z'));
    expect(p.date).toBe('2026-06-01');
    expect(p.hour).toBe(4);
    expect(p.weekday).toBe('Mon');
  });

  it('午夜回傳 0 點 (h23 制,不會出現 24)', () => {
    const p = localParts('Asia/Taipei', new Date('2026-05-31T16:00:00Z')); // 台北 00:00
    expect(p.hour).toBe(0);
    expect(p.date).toBe('2026-06-01');
  });
});

describe('dueNotifications', () => {
  const tue = 'Tue';

  it('當地時間到睡前時間才推睡前提醒', () => {
    expect(dueNotifications(23, { hour: 23, weekday: tue })).toContain('bedtime');
    expect(dueNotifications(23, { hour: 22, weekday: tue })).not.toContain('bedtime');
  });

  it('每日固定時間推日報', () => {
    expect(dueNotifications(23, { hour: DAILY_REPORT_HOUR, weekday: tue })).toEqual(['daily']);
  });

  it('週報只在指定星期 + 時間推 (與日報同時)', () => {
    // WHY: 週一早上同時送日報(昨日)與週報(上週),兩者內容不同,皆應觸發。
    const due = dueNotifications(23, { hour: WEEKLY_REPORT_HOUR, weekday: WEEKLY_REPORT_WEEKDAY });
    expect(due).toContain('daily');
    expect(due).toContain('weekly');
  });

  it('非觸發時間回空陣列', () => {
    expect(dueNotifications(23, { hour: 15, weekday: tue })).toEqual([]);
  });

  it('睡前時間恰逢日報時間時兩者都推', () => {
    expect(dueNotifications(DAILY_REPORT_HOUR, { hour: DAILY_REPORT_HOUR, weekday: tue })).toEqual([
      'bedtime',
      'daily',
    ]);
  });
});

describe('summarizeWeek', () => {
  const tdee = 1800;
  const targetDeficit = 400;

  it('沒有記錄時全為 0 (避免除以零)', () => {
    const s = summarizeWeek([], tdee, targetDeficit);
    expect(s).toEqual({ daysLogged: 0, daysMet: 0, avgIntake: 0, totalDeficit: 0 });
  });

  it('聚合達標天數、平均攝取與週赤字總計', () => {
    // 三天: 赤字 500(達標) / 200(未達) / 400(達標)
    const days = [
      { intake: 1300, burn: 0 },
      { intake: 1600, burn: 0 },
      { intake: 1400, burn: 0 },
    ];
    const s = summarizeWeek(days, tdee, targetDeficit);
    expect(s.daysLogged).toBe(3);
    expect(s.daysMet).toBe(2);
    expect(s.avgIntake).toBe(Math.round((1300 + 1600 + 1400) / 3));
    expect(s.totalDeficit).toBe(500 + 200 + 400);
  });

  it('運動消耗計入支出、推進赤字 (與 computeDay 一致)', () => {
    // WHY: 週報的赤字必須和每日卡用同一套 computeDay,否則兩處數字對不起來。
    const days = [{ intake: 1600, burn: 300 }]; // 支出 2100,赤字 500 → 達標
    const s = summarizeWeek(days, tdee, targetDeficit);
    expect(s.daysMet).toBe(1);
    expect(s.totalDeficit).toBe(500);
  });
});
