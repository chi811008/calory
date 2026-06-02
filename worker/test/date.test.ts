import { describe, it, expect } from 'vitest';
import { addDays, localDate } from '../src/domain/date';

describe('addDays', () => {
  it('跨月加一天', () => {
    expect(addDays('2026-05-31', 1)).toBe('2026-06-01');
  });
  it('跨月減一天', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('localDate', () => {
  it('依時區換算當地日期 (台北 +8 跨日)', () => {
    // WHY: 日期分界必須用使用者時區,否則 UTC 午夜會把記錄歸錯天。
    expect(localDate('Asia/Taipei', new Date('2026-05-31T16:30:00Z'))).toBe('2026-06-01');
  });
});
