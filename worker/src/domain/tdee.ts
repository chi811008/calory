import type { Sex } from '../types';

/**
 * 活動係數 — 皆為「不含刻意運動」的基礎水準。
 * 運動消耗一律另外用 exercise_logs 加上去 (見 calories.computeDay),
 * 所以這裡刻意只提供久坐/輕度,避免把運動算進去又算一次 (double count)。
 */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2, // 久坐:辦公室、平常很少活動
  light: 1.375, // 輕度:日常走動較多,但沒有規律運動
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_FACTORS;

/** Mifflin-St Jeor 基礎代謝率 (BMR),單位大卡。 */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/** 每日總消耗 (TDEE) = BMR × 活動係數,四捨五入到整數卡。 */
export function tdee(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
  activityFactor: number,
): number {
  return Math.round(bmr(sex, weightKg, heightCm, age) * activityFactor);
}
