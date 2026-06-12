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

// 各餐別圖點開 bar 時要顯示的單筆食物項目。label 為 null 的記錄由顯示端補餐別名。
export interface MealItem {
  label: string | null;
  calories: number;
}

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
  goalKg: number; // 減重目標公斤數 (0 = 未設定)
  createdAt: string;
}
