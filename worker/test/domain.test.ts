import { describe, it, expect } from 'vitest';
import { bmr, tdee, ACTIVITY_FACTORS } from '../src/domain/tdee';
import { computeDay } from '../src/domain/calories';
import { currentStreak, streakBadge } from '../src/domain/streak';
import { parseMessage } from '../src/domain/parse';

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

describe('parseMessage — 單筆記錄', () => {
  it('解析餐點 + 熱量', () => {
    expect(parseMessage('午餐 600')).toEqual({
      kind: 'log',
      items: [{ type: 'food', meal: 'lunch', calories: 600, label: null }],
    });
  });

  it('解析餐點 + 名稱 + 熱量 (標籤抽取)', () => {
    expect(parseMessage('午餐 雞腿便當 750')).toEqual({
      kind: 'log',
      items: [{ type: 'food', meal: 'lunch', calories: 750, label: '雞腿便當' }],
    });
  });

  it('單字餐點關鍵字也可 (早 → 早餐)', () => {
    expect(parseMessage('早 350')).toEqual({
      kind: 'log',
      items: [{ type: 'food', meal: 'breakfast', calories: 350, label: null }],
    });
  });

  it('沒給數字 → calories=null (留待範本/AI 估算)', () => {
    // WHY: 「自己計算」要靠這個 null 訊號,handler 才知道要查範本或叫 AI,而非當成錯誤。
    expect(parseMessage('午餐 滷肉飯小碗')).toEqual({
      kind: 'log',
      items: [{ type: 'food', meal: 'lunch', calories: null, label: '滷肉飯小碗' }],
    });
  });

  it('解析運動消耗', () => {
    expect(parseMessage('運動 300')).toEqual({
      kind: 'log',
      items: [{ type: 'exercise', calories: 300, label: null }],
    });
  });

  it('運動動詞當標籤', () => {
    expect(parseMessage('跑步 250')).toEqual({
      kind: 'log',
      items: [{ type: 'exercise', calories: 250, label: '跑步' }],
    });
  });
});

describe('parseMessage — 多行多筆 (修正只記第一筆的 bug)', () => {
  it('一則多行訊息記成多筆,沒餐別關鍵字的行延續上一個餐別', () => {
    // WHY: 這是回歸測試。舊版只認第一個餐別、只抓第一個數字,整段被當成一筆 80 卡。
    const msg = [
      '早餐 水煮蛋 80',
      '酸種麵包 150',
      '豆漿一瓶 144',
      '午餐 甘蔗雞無飯便當 500',
      '點心 中杯莊園冰拿鐵 267',
      '晚餐 咖哩雞蔬菜 300',
    ].join('\n');

    const r = parseMessage(msg);
    expect(r.kind).toBe('log');
    if (r.kind !== 'log') return;

    expect(r.items).toEqual([
      { type: 'food', meal: 'breakfast', calories: 80, label: '水煮蛋' },
      { type: 'food', meal: 'breakfast', calories: 150, label: '酸種麵包' },
      { type: 'food', meal: 'breakfast', calories: 144, label: '豆漿一瓶' },
      { type: 'food', meal: 'lunch', calories: 500, label: '甘蔗雞無飯便當' },
      { type: 'food', meal: 'snack', calories: 267, label: '中杯莊園冰拿鐵' },
      { type: 'food', meal: 'dinner', calories: 300, label: '咖哩雞蔬菜' },
    ]);

    // 總計必須是 1441,不能再是舊版的 80。
    const total = r.items.reduce((s, i) => s + (i.calories ?? 0), 0);
    expect(total).toBe(1441);
  });

  it('純餐別關鍵字當標題行,底下各行歸到該餐', () => {
    const r = parseMessage('午餐\n滷肉飯 450\n燙青菜 50');
    expect(r).toEqual({
      kind: 'log',
      items: [
        { type: 'food', meal: 'lunch', calories: 450, label: '滷肉飯' },
        { type: 'food', meal: 'lunch', calories: 50, label: '燙青菜' },
      ],
    });
  });

  it('第一行沒餐別就有數字 → 預設 snack 並標記 defaulted', () => {
    // WHY: handler 靠 defaulted 在回覆裡標「未指定餐別→點心」,不靜默歸類。
    expect(parseMessage('燕麥 200')).toEqual({
      kind: 'log',
      items: [{ type: 'food', meal: 'snack', calories: 200, label: '燕麥', defaulted: true }],
    });
  });

  it('空行被略過', () => {
    const r = parseMessage('早餐 蛋 80\n\n午餐 便當 700');
    expect(r.kind).toBe('log');
    if (r.kind !== 'log') return;
    expect(r.items).toHaveLength(2);
  });

  it('「中」開頭的延續行不被誤判成午餐 (單字關鍵字只留早午晚)', () => {
    // WHY: 「中杯/中份」很常見;若單字「中」算午餐關鍵字,延續行會被切成新的一餐。
    const r = parseMessage('點心 拿鐵 130\n中份薯條 200');
    expect(r).toEqual({
      kind: 'log',
      items: [
        { type: 'food', meal: 'snack', calories: 130, label: '拿鐵' },
        { type: 'food', meal: 'snack', calories: 200, label: '中份薯條' },
      ],
    });
  });
});

describe('parseMessage — 控制指令', () => {
  it('今日類關鍵字 → today', () => {
    expect(parseMessage('今天')).toEqual({ kind: 'today' });
    expect(parseMessage('進度')).toEqual({ kind: 'today' });
  });

  it('設定類關鍵字 → settings (觸發重新引導)', () => {
    // WHY: webhook 靠這個 kind 把使用者重新導入個人化引導,不能被誤判成 help。
    expect(parseMessage('設定')).toEqual({ kind: 'settings' });
    expect(parseMessage('重新設定')).toEqual({ kind: 'settings' });
  });

  it('存範本 / 列範本 / 刪範本', () => {
    expect(parseMessage('存 滷肉飯小碗 450')).toEqual({
      kind: 'savePreset',
      label: '滷肉飯小碗',
      calories: 450,
    });
    expect(parseMessage('範本')).toEqual({ kind: 'listPresets' });
    expect(parseMessage('刪範本 滷肉飯小碗')).toEqual({
      kind: 'deletePreset',
      label: '滷肉飯小碗',
    });
  });

  it('改 N C / 刪 N (修改今日食物記錄)', () => {
    expect(parseMessage('改 2 500')).toEqual({ kind: 'editFood', index: 2, calories: 500 });
    expect(parseMessage('刪 3')).toEqual({ kind: 'deleteFood', index: 3 });
  });

  it('運動清單 / 改運動 N C / 刪運動 N (列出與修改今日運動記錄)', () => {
    expect(parseMessage('運動清單')).toEqual({ kind: 'listExercise' });
    expect(parseMessage('運動列表')).toEqual({ kind: 'listExercise' });
    expect(parseMessage('改運動 2 250')).toEqual({
      kind: 'editExercise',
      index: 2,
      calories: 250,
    });
    expect(parseMessage('刪運動 3')).toEqual({ kind: 'deleteExercise', index: 3 });
  });

  it('運動指令不可被「運動 N 記錄」或「改/刪 N」誤判 (順序)', () => {
    // WHY: 「運動清單」開頭是運動關鍵字,須在控制指令層先判,否則落入記錄批次;
    //      「改運動/刪運動」也須早於 editFood/deleteFood,免得被當成食物序號。
    expect(parseMessage('運動清單').kind).toBe('listExercise');
    expect(parseMessage('改運動 1 100').kind).toBe('editExercise');
    expect(parseMessage('刪運動 1').kind).toBe('deleteExercise');
    // 裸「運動 300」仍是記一筆運動,不受影響。
    expect(parseMessage('運動 300')).toEqual({
      kind: 'log',
      items: [{ type: 'exercise', calories: 300, label: null }],
    });
  });

  it('刪範本 不可被「刪 N」誤判 (順序)', () => {
    // WHY: 兩者都以「刪」開頭,刪範本須先判,否則範本名被當成序號失敗。
    expect(parseMessage('刪範本 拿鐵').kind).toBe('deletePreset');
  });

  it('無法辨識或空白 → help', () => {
    expect(parseMessage('哈囉')).toEqual({ kind: 'help' });
    expect(parseMessage('   ')).toEqual({ kind: 'help' });
  });

  it('純餐別關鍵字無內容 → help (沒東西可記)', () => {
    expect(parseMessage('午餐')).toEqual({ kind: 'help' });
  });
});
