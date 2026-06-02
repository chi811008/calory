import type { Env } from '../types';
import { advance, finalize, nextStep, type OnboardingDraft } from '../domain/onboarding';
import { clearOnboarding, saveUserSettings, setOnboarding } from '../db/repo';
import { onboardingPrompt, onboardingDone } from '../line/onboarding';
import { replyMessage } from '../line/client';

/** 開始 (或重新開始) 個人化引導:建立空白草稿並問第一題。 */
export async function startOnboarding(env: Env, userId: string, replyToken: string): Promise<void> {
  const draft: OnboardingDraft = {};
  await setOnboarding(env, userId, draft);
  const step = nextStep(draft);
  if (step === null) return; // 不會發生:空草稿必有第一步。型別收斂用。
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [onboardingPrompt(step)]);
}

/**
 * 處理引導中使用者的回覆:把答案套進當前步驟。
 * - 驗證失敗 → 原地重問 (附錯誤),不前進。
 * - 還有下一題 → 存草稿並問下一題。
 * - 全部填完 → 算 TDEE、寫回 users、清草稿、回摘要。
 */
export async function handleOnboarding(
  env: Env,
  userId: string,
  draft: OnboardingDraft,
  text: string,
  replyToken: string,
): Promise<void> {
  const step = nextStep(draft);
  if (step === null) {
    // 防禦:有草稿卻已完成 (理論上不該發生)。清掉並重新開始,避免卡住。
    await clearOnboarding(env, userId);
    return startOnboarding(env, userId, replyToken);
  }

  const result = advance(draft, step, text);
  if (!result.ok) {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [
      onboardingPrompt(step, result.error),
    ]);
    return;
  }

  const next = nextStep(result.draft);
  if (next === null) {
    const settings = finalize(result.draft);
    await saveUserSettings(env, userId, settings);
    await clearOnboarding(env, userId);
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [onboardingDone(settings)]);
    return;
  }

  await setOnboarding(env, userId, result.draft);
  await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [onboardingPrompt(next)]);
}
