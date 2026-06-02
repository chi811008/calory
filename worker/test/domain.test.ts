import { describe, it, expect } from 'vitest';
import { bmr, tdee, ACTIVITY_FACTORS } from '../src/domain/tdee';
import { computeDay } from '../src/domain/calories';
import { currentStreak, streakBadge } from '../src/domain/streak';
import { parseCommand } from '../src/domain/parse';

describe('tdee', () => {
  it('用 Mifflin-St Jeor 算男性 BMR', () => {
    // 70kg / 175cm / 30 歲男: 10*70 + 6.25*175 - 5*30 + 5 = 1648.75
    expect(bmr('male', 70, 175, 30)).toBeCloseTo(1648.75, 2);
  });

  it('女性 BMR 比同條件男性少 166 (公式常數 +5 vs -161)', () => {
    expect(bmr('male', 60, 165, 28) - bmr('female', 60, 165, 28)).toBe(166);
  });

  it('TDEE = BMR × 活動係數並四捨五入', () => {
    const expected = Math.round(bmr('male', 70, 175, 30) * ACTIVITY_FACTORS.sedentary);
    expect(tdee('male', 70, 175, 30, ACTIVITY_FACTORS.sedentary)).toBe(expected);
  });

  it('活動係數只提供久坐/輕度,避免把運動重複算進 TDEE', () => {
    // WHY: 運動是另外記錄並加總的 (見 computeDay),活動係數若含運動會 double count。
    expect(ACTIVITY_FACTORS.sedentary).toBe(1.2);
    expect(Math.max(...Object.values(ACTIVITY_FACTORS))).toBeLessThanOrEqual(1.375);
  });
});

describe('computeDay', () => {
  const base = { tdee: 1800, targetDeficit: 400 };

  it('赤字 = 支出 - 攝取', () => {
    const r = computeDay({ ...base, intake: 1300, exerciseBurn: 0 });
    expect(r.expenditure).toBe(1800);
    expect(r.deficit).toBe(500);
  });

  it('赤字恰好等於目標即算達標 (邊界)', () => {
    const r = computeDay({ ...base, intake: 1400, exerciseBurn: 0 });
    expect(r.deficit).toBe(400);
    expect(r.met).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it('記錄運動會增加支出、推進赤字 (證明運動是加上去而非重複計算)', () => {
    // WHY: 這正是 tdee 用久坐係數的理由 —— 運動必須真的幫你更接近目標。
    const without = computeDay({ ...base, intake: 1600, exerciseBurn: 0 });
    const withWorkout = computeDay({ ...base, intake: 1600, exerciseBurn: 300 });
    expect(without.deficit).toBe(200);
    expect(withWorkout.deficit).toBe(500);
    expect(withWorkout.met).toBe(true);
    expect(without.met).toBe(false);
  });

  it('吃超標時赤字為負,未達標,還差的卡數大於目標', () => {
    const r = computeDay({ ...base, intake: 2000, exerciseBurn: 0 });
    expect(r.deficit).toBe(-200);
    expect(r.met).toBe(false);
    expect(r.remaining).toBe(600); // 400 - (-200)
    expect(r.progress).toBe(0); // 進度不顯示負值
  });

  it('進度封頂在 1 (超額達標不會超過滿格)', () => {
    const r = computeDay({ ...base, intake: 800, exerciseBurn: 0 });
    expect(r.deficit).toBe(1000);
    expect(r.progress).toBe(1);
  });

  it('未達標時進度為 0..1 之間的比例', () => {
    const r = computeDay({ ...base, intake: 1600, exerciseBurn: 0 });
    expect(r.progress).toBeCloseTo(200 / 400, 5);
  });
});

describe('currentStreak', () => {
  const d = (date: string, met: boolean) => ({ date, met });

  it('從最近一天往回數連續達標', () => {
    expect(
      currentStreak([d('2026-05-29', true), d('2026-05-30', true), d('2026-05-31', true)]),
    ).toBe(3);
  });

  it('最近一天未達標則連續歸零', () => {
    expect(
      currentStreak([d('2026-05-29', true), d('2026-05-30', true), d('2026-05-31', false)]),
    ).toBe(0);
  });

  it('只計算結尾連續段,中間斷掉不算進去', () => {
    // WHY: streak 的意義是「目前連續」,中間斷過就該重新起算。
    expect(
      currentStreak([d('2026-05-28', true), d('2026-05-29', false), d('2026-05-30', true), d('2026-05-31', true)]),
    ).toBe(2);
  });

  it('空資料回 0', () => {
    expect(currentStreak([])).toBe(0);
  });
});

describe('streakBadge', () => {
  it('恰好踩到里程碑才回徽章 (只宣告一次)', () => {
    expect(streakBadge(7)).toContain('7');
    expect(streakBadge(6)).toBeNull();
    expect(streakBadge(8)).toBeNull();
  });
});

describe('parseCommand', () => {
  it('解析餐點 + 熱量', () => {
    expect(parseCommand('午餐 600')).toEqual({ kind: 'food', meal: 'lunch', calories: 600 });
  });

  it('解析餐點 + 名稱 + 熱量 (標籤抽取)', () => {
    expect(parseCommand('午餐 雞腿便當 750')).toEqual({
      kind: 'food',
      meal: 'lunch',
      calories: 750,
      label: '雞腿便當',
    });
  });

  it('單字餐點關鍵字也可 (早 → 早餐)', () => {
    expect(parseCommand('早 350')).toEqual({ kind: 'food', meal: 'breakfast', calories: 350 });
  });

  it('解析運動消耗', () => {
    expect(parseCommand('運動 300')).toEqual({ kind: 'exercise', calories: 300 });
  });

  it('運動動詞當標籤', () => {
    expect(parseCommand('跑步 250')).toEqual({ kind: 'exercise', calories: 250, label: '跑步' });
  });

  it('今日類關鍵字 → today', () => {
    expect(parseCommand('今天')).toEqual({ kind: 'today' });
    expect(parseCommand('進度')).toEqual({ kind: 'today' });
  });

  it('設定類關鍵字 → settings (觸發重新引導)', () => {
    // WHY: webhook 靠這個 kind 把使用者重新導入個人化引導,不能被誤判成 help。
    expect(parseCommand('設定')).toEqual({ kind: 'settings' });
    expect(parseCommand('重新設定')).toEqual({ kind: 'settings' });
  });

  it('沒有有效數字或無法辨識 → help', () => {
    expect(parseCommand('午餐')).toEqual({ kind: 'help' });
    expect(parseCommand('哈囉')).toEqual({ kind: 'help' });
    expect(parseCommand('   ')).toEqual({ kind: 'help' });
  });

  it('熱量需為正數,否則 help', () => {
    expect(parseCommand('午餐 0')).toEqual({ kind: 'help' });
  });
});
