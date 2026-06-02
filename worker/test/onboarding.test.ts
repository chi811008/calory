import { describe, it, expect } from 'vitest';
import {
  STEP_ORDER,
  nextStep,
  applyAnswer,
  advance,
  finalize,
  type OnboardingDraft,
} from '../src/domain/onboarding';
import { tdee, ACTIVITY_FACTORS } from '../src/domain/tdee';

describe('nextStep', () => {
  it('空草稿從第一步 (性別) 開始', () => {
    expect(nextStep({})).toBe('sex');
  });

  it('回傳第一個還沒填的欄位 (依固定順序)', () => {
    expect(nextStep({ sex: 'male' })).toBe('age');
    expect(nextStep({ sex: 'male', age: 30, heightCm: 175 })).toBe('weightKg');
  });

  it('全部填完回 null (代表引導完成)', () => {
    const full: OnboardingDraft = {
      sex: 'male',
      age: 30,
      heightCm: 175,
      weightKg: 70,
      activityFactor: ACTIVITY_FACTORS.sedentary,
      targetDeficit: 400,
      bedtimeHour: 23,
    };
    expect(nextStep(full)).toBeNull();
  });

  it('順序涵蓋並只涵蓋 finalize 需要的所有欄位', () => {
    // WHY: nextStep 推進靠這份順序;漏一個欄位會讓引導提早判定完成、finalize 缺值。
    expect(STEP_ORDER).toEqual([
      'sex',
      'age',
      'heightCm',
      'weightKg',
      'activityFactor',
      'targetDeficit',
      'bedtimeHour',
    ]);
  });
});

describe('applyAnswer 性別', () => {
  it('接受中英文寫法', () => {
    expect(applyAnswer('sex', '男')).toEqual({ ok: true, value: 'male' });
    expect(applyAnswer('sex', '女生')).toEqual({ ok: true, value: 'female' });
    expect(applyAnswer('sex', 'Male')).toEqual({ ok: true, value: 'male' });
  });

  it('無法辨識時回錯誤而非猜測', () => {
    // WHY: 性別直接影響 BMR 公式 (±166 卡),猜錯會讓整個 TDEE 失準,寧可重問。
    const r = applyAnswer('sex', '不知道');
    expect(r.ok).toBe(false);
  });
});

describe('applyAnswer 活動量', () => {
  it('久坐 / 輕度對應到 tdee 的活動係數', () => {
    expect(applyAnswer('activityFactor', '久坐')).toEqual({
      ok: true,
      value: ACTIVITY_FACTORS.sedentary,
    });
    expect(applyAnswer('activityFactor', '輕度')).toEqual({
      ok: true,
      value: ACTIVITY_FACTORS.light,
    });
  });

  it('其他活動量字眼不接受 (只支援久坐/輕度)', () => {
    // WHY: 係數刻意只到輕度,運動另計避免 double count;放行「中度/高」會重複計算運動。
    expect(applyAnswer('activityFactor', '高強度').ok).toBe(false);
  });
});

describe('applyAnswer 數值欄位', () => {
  it('從文字抽數字並四捨五入整數欄位 (年齡)', () => {
    expect(applyAnswer('age', '我 30 歲')).toEqual({ ok: true, value: 30 });
  });

  it('體重保留小數', () => {
    expect(applyAnswer('weightKg', '70.5')).toEqual({ ok: true, value: 70.5 });
  });

  it('超出合理範圍回錯誤 (年齡上下界)', () => {
    expect(applyAnswer('age', '5').ok).toBe(false);
    expect(applyAnswer('age', '200').ok).toBe(false);
  });

  it('睡前時間限定 0–23 點', () => {
    expect(applyAnswer('bedtimeHour', '23')).toEqual({ ok: true, value: 23 });
    expect(applyAnswer('bedtimeHour', '24').ok).toBe(false);
    expect(applyAnswer('bedtimeHour', '0')).toEqual({ ok: true, value: 0 });
  });

  it('沒有數字時回錯誤', () => {
    expect(applyAnswer('heightCm', '很高').ok).toBe(false);
  });
});

describe('advance', () => {
  it('成功時回傳新草稿且不變動原草稿 (不可變)', () => {
    const draft: OnboardingDraft = { sex: 'male' };
    const r = advance(draft, 'age', '30');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft).toEqual({ sex: 'male', age: 30 });
      expect(draft).toEqual({ sex: 'male' }); // 原物件未被修改
    }
  });

  it('驗證失敗時回錯誤、不前進', () => {
    const r = advance({ sex: 'male' }, 'age', 'abc');
    expect(r.ok).toBe(false);
  });
});

describe('finalize', () => {
  const full: OnboardingDraft = {
    sex: 'male',
    age: 30,
    heightCm: 175,
    weightKg: 70,
    activityFactor: ACTIVITY_FACTORS.sedentary,
    targetDeficit: 400,
    bedtimeHour: 23,
  };

  it('用收集到的資料算出 TDEE 並帶齊設定', () => {
    const s = finalize(full);
    expect(s.tdee).toBe(tdee('male', 70, 175, 30, ACTIVITY_FACTORS.sedentary));
    expect(s.targetDeficit).toBe(400);
    expect(s.bedtimeHour).toBe(23);
    expect(s.sex).toBe('male');
  });

  it('草稿不完整時擲錯 (絕不寫入半套設定)', () => {
    // WHY: finalize 只該在 nextStep === null 後呼叫;缺值就落地會產生壞掉的 TDEE。
    expect(() => finalize({ sex: 'male', age: 30 })).toThrow();
  });
});

describe('完整引導序列', () => {
  it('逐步回答可走到完成並算出正確 TDEE', () => {
    // WHY: 端到端驗證 nextStep/advance/finalize 串起來的契約,而非各自孤立正確。
    const answers: Array<[string, string]> = [
      ['sex', '女'],
      ['age', '28'],
      ['heightCm', '162'],
      ['weightKg', '55'],
      ['activityFactor', '輕度'],
      ['targetDeficit', '300'],
      ['bedtimeHour', '23'],
    ];

    let draft: OnboardingDraft = {};
    for (const [expectedStep, reply] of answers) {
      expect(nextStep(draft)).toBe(expectedStep);
      const r = advance(draft, nextStep(draft)!, reply);
      expect(r.ok).toBe(true);
      if (r.ok) draft = r.draft;
    }

    expect(nextStep(draft)).toBeNull();
    const s = finalize(draft);
    expect(s.tdee).toBe(tdee('female', 55, 162, 28, ACTIVITY_FACTORS.light));
    expect(s.targetDeficit).toBe(300);
  });
});
