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
  it('任何階段:放棄類 → cancel', () => {
    // WHY: 放棄是唯一的逃生指令,任何階段都要能中止這張照片,不被當成描述。
    expect(parsePhotoReply('取消', 'describe')).toEqual({ kind: 'cancel' });
    expect(parsePhotoReply('放棄', 'review')).toEqual({ kind: 'cancel' });
    expect(parsePhotoReply('重拍', 'meal')).toEqual({ kind: 'cancel' });
  });

  describe('describe 階段 (剛收到照片,等補充)', () => {
    it('「直接估算」按鈕 → estimateNow', () => {
      expect(parsePhotoReply('直接估算', 'describe')).toEqual({ kind: 'estimateNow' });
      expect(parsePhotoReply('不用補充', 'describe')).toEqual({ kind: 'estimateNow' });
    });

    it('自由文字 (含品名/份量/數字) → describe,連同照片重估', () => {
      // WHY: 補充階段的文字就是要餵給模型的描述,份量數字 (300ml) 不能被當成手動記錄攔走。
      expect(parsePhotoReply('無糖冰咖啡', 'describe')).toEqual({
        kind: 'describe',
        text: '無糖冰咖啡',
      });
      expect(parsePhotoReply('花魚一夜干 一片', 'describe')).toEqual({
        kind: 'describe',
        text: '花魚一夜干 一片',
      });
      expect(parsePhotoReply('300ml', 'describe')).toEqual({ kind: 'describe', text: '300ml' });
    });
  });

  describe('review 階段 (已估算,等儲存或再補充)', () => {
    it('「儲存」按鈕 → save', () => {
      expect(parsePhotoReply('儲存', 'review')).toEqual({ kind: 'save' });
    });

    it('自由文字 → describe (再補充並重估)', () => {
      expect(parsePhotoReply('其實是大杯', 'review')).toEqual({
        kind: 'describe',
        text: '其實是大杯',
      });
    });
  });

  describe('meal 階段 (已按儲存,等選餐別)', () => {
    it('純餐別關鍵字 → 指定餐別', () => {
      expect(parsePhotoReply('午餐', 'meal')).toEqual({ kind: 'meal', meal: 'lunch' });
      expect(parsePhotoReply('飲料', 'meal')).toEqual({ kind: 'meal', meal: 'drink' });
    });

    it('非餐別文字 → other (落回一般指令)', () => {
      expect(parsePhotoReply('你好', 'meal')).toEqual({ kind: 'other' });
    });
  });
});
