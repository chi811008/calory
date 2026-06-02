// 每日熱量收支 / 赤字計算 — 全為純函式,熱量遊戲化的核心。

export interface DayInput {
  tdee: number; // 不含運動的每日基礎消耗
  intake: number; // 當日攝取
  exerciseBurn: number; // 當日運動消耗
  targetDeficit: number; // 目標赤字 (預設 400)
}

export interface DayResult {
  expenditure: number; // 總支出 = tdee + 運動
  deficit: number; // 赤字 = 支出 - 攝取 (負值代表吃超標)
  met: boolean; // 是否達到目標赤字
  remaining: number; // 還差多少卡才達標 (已達標為 0)
  progress: number; // 0..1,朝目標赤字的進度
}

export function computeDay(input: DayInput): DayResult {
  // 運動消耗加在 tdee 之上 —— 因為 tdee 用的是久坐係數 (見 tdee.ts),
  // 所以記錄運動會真的增加支出、推進赤字,不會被重複計算。
  const expenditure = input.tdee + input.exerciseBurn;
  const deficit = expenditure - input.intake;
  const met = deficit >= input.targetDeficit;
  const remaining = met ? 0 : input.targetDeficit - deficit;

  let progress: number;
  if (input.targetDeficit <= 0) {
    progress = met ? 1 : 0;
  } else {
    progress = Math.min(Math.max(deficit / input.targetDeficit, 0), 1);
  }

  return { expenditure, deficit, met, remaining, progress };
}
