import type { OnboardingStep, OnboardingSettings } from '../domain/onboarding';
import { ACTIVITY_FACTORS } from '../domain/tdee';

// 引導每一步的提問訊息。能用選的 (性別/活動量/赤字) 就附 Quick Reply 按鈕,
// 降低打字與輸入錯誤;身高體重年齡睡前時間則請使用者直接打數字。

function quickReply(labels: string[]): object {
  return {
    items: labels.map((label) => ({
      type: 'action',
      action: { type: 'message', label, text: label },
    })),
  };
}

interface Prompt {
  text: string;
  quick?: string[];
}

const PROMPTS: Record<OnboardingStep, Prompt> = {
  sex: {
    text: '👋 歡迎使用卡路里赤字小幫手！\n先花約 30 秒做個人化設定，算出專屬於你的每日消耗。\n\n請問你的生理性別？',
    quick: ['男', '女'],
  },
  age: { text: '年齡幾歲？(例：30)' },
  heightCm: { text: '身高幾公分？(例：175)' },
  weightKg: { text: '體重幾公斤？(例：70)' },
  activityFactor: {
    text: '平常的活動量？\n・久坐：辦公室、平常很少走動\n・輕度：日常走動較多，但沒有規律運動\n(運動會另外記錄，所以這裡不用把運動算進去)',
    quick: ['久坐', '輕度'],
  },
  targetDeficit: {
    text: '想設定每天的熱量赤字目標？\n(每累積約 7700 卡 ≈ 減 1 公斤；新手建議 300–500)',
    quick: ['300', '400', '500'],
  },
  bedtimeHour: { text: '幾點睡？之後會在睡前幫你提醒收支。\n(輸入 0–23 的整點，例：23)' },
};

/** 組出某步驟的提問訊息;error 不為空時於前方加上錯誤提示再重問。 */
export function onboardingPrompt(step: OnboardingStep, error?: string): object {
  const prompt = PROMPTS[step];
  const text = error ? `⚠️ ${error}\n\n${prompt.text}` : prompt.text;
  const msg: Record<string, unknown> = { type: 'text', text };
  if (prompt.quick) msg.quickReply = quickReply(prompt.quick);
  return msg;
}

/** 引導完成的摘要訊息:確認設定 + 教學怎麼開始記錄。 */
export function onboardingDone(s: OnboardingSettings): object {
  const sexLabel = s.sex === 'male' ? '男' : '女';
  const activityLabel = s.activityFactor === ACTIVITY_FACTORS.sedentary ? '久坐' : '輕度';
  const bedtime = `${String(s.bedtimeHour).padStart(2, '0')}:00`;
  return {
    type: 'text',
    text: [
      '✅ 個人化設定完成！',
      '',
      `${sexLabel}・${s.age} 歲・${s.heightCm} cm・${s.weightKg} kg・${activityLabel}`,
      `每日基礎消耗 (TDEE)：${s.tdee} 卡`,
      `目標赤字：${s.targetDeficit} 卡 / 天`,
      `睡前時間：${bedtime}`,
      '',
      '開始記錄吧 👇',
      '・餐點：午餐 600 / 早餐 燕麥 350',
      '・運動：運動 300 / 跑步 250',
      '・查看今日：今天 / 進度',
      '',
      '想重新設定隨時打「設定」。',
    ].join('\n'),
  };
}
