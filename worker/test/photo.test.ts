import { describe, it, expect } from 'vitest';
import { normalizeEstimate, isPendingFresh, PENDING_PHOTO_TTL_MS } from '../src/domain/photo';
import { parsePhotoReply } from '../src/domain/parse';

describe('normalizeEstimate', () => {
  it('接受合法的品名+熱量並四捨五入', () => {
    expect(normalizeEstimate({ label: '雞腿便當', calories: 749.6 })).toEqual({
      label: '雞腿便當',
      calories: 750,
    });
  });

  it('熱量是數字字串也容忍 (模型有時回字串)', () => {
    expect(normalizeEstimate({ label: '拿鐵', calories: '180' })).toEqual({
      label: '拿鐵',
      calories: 180,
    });
  });

  it('缺品名時給預設品名,不丟掉有效熱量', () => {
    expect(normalizeEstimate({ calories: 500 })).toEqual({ label: '餐點', calories: 500 });
  });

  it('熱量 0 / 負 / 超界 / 非數字 一律視為辨識失敗 (回 null)', () => {
    // WHY: 模型看不出食物時我們約定回 0;界限外的數字多半是亂猜,寧可請使用者改打字。
    expect(normalizeEstimate({ label: 'x', calories: 0 })).toBeNull();
    expect(normalizeEstimate({ label: 'x', calories: -50 })).toBeNull();
    expect(normalizeEstimate({ label: 'x', calories: 99999 })).toBeNull();
    expect(normalizeEstimate({ label: 'x', calories: 'abc' })).toBeNull();
  });

  it('非物件輸入回 null', () => {
    expect(normalizeEstimate(null)).toBeNull();
    expect(normalizeEstimate('650')).toBeNull();
  });
});

describe('isPendingFresh', () => {
  const created = '2026-06-01 00:00:00'; // D1 datetime('now') 格式 (UTC,空格分隔)

  it('TTL 內視為新鮮', () => {
    const now = new Date('2026-06-01T00:10:00Z'); // 10 分鐘後
    expect(isPendingFresh(created, now)).toBe(true);
  });

  it('超過 TTL 視為過期 (避免舊照片誤觸後續訊息)', () => {
    // WHY: pending 照片若不過期,使用者幾小時後打一個餐別關鍵字會被舊估算劫持。
    const now = new Date(Date.parse('2026-06-01T00:00:00Z') + PENDING_PHOTO_TTL_MS + 1000);
    expect(isPendingFresh(created, now)).toBe(false);
  });

  it('壞掉的時間字串視為過期', () => {
    expect(isPendingFresh('not-a-date', new Date())).toBe(false);
  });
});

describe('parsePhotoReply', () => {
  it('純餐別關鍵字 → 指定餐別 (確認照片)', () => {
    expect(parsePhotoReply('午餐')).toEqual({ kind: 'meal', meal: 'lunch' });
    expect(parsePhotoReply('早餐')).toEqual({ kind: 'meal', meal: 'breakfast' });
  });

  it('取消類 → cancel', () => {
    expect(parsePhotoReply('取消')).toEqual({ kind: 'cancel' });
    expect(parsePhotoReply('重拍')).toEqual({ kind: 'cancel' });
  });

  it('含數字的訊息不攔截,當成一般指令', () => {
    // WHY: 「午餐 600」是使用者要手動記 600,不能被解讀成把照片估算記到午餐。
    expect(parsePhotoReply('午餐 600')).toEqual({ kind: 'other' });
  });

  it('其他文字 → other (落回一般指令處理)', () => {
    expect(parsePhotoReply('今天')).toEqual({ kind: 'other' });
    expect(parsePhotoReply('你好')).toEqual({ kind: 'other' });
  });
});
