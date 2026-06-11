// 共用型別與 Worker 環境綁定。

export interface Env {
  DB: D1Database;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  GEMINI_API_KEY: string;
  LIFF_URL?: string;
  // LIFF 儀表板 (Phase 5):
  LIFF_ID?: string; // 前端 liff.init({ liffId }) 用
  LIFF_CHANNEL_ID?: string; // 驗證 id_token 的 aud (LINE Login channel id)
}

export type Sex = 'male' | 'female';
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '點心',
  drink: '飲料',
};

export interface User {
  lineUserId: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityFactor: number;
  tdee: number;
  targetDeficit: number;
  bedtimeHour: number;
  tz: string;
  onboarded: boolean;
  createdAt: string;
}
