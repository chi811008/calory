import type { Env, User } from '../types';
import { addDays, localParts } from '../domain/date';
import { dueNotifications, type NotifyKind } from '../domain/schedule';
import { summarizeWeek } from '../domain/weekly';
import { computeDaySummary, daySummaryFlex } from './today';
import { getDailyTotals, getOnboardedUsers, markNotified } from '../db/repo';
import { weeklyMessage } from '../line/weekly';
import { pushMessage } from '../line/client';

// 排程推播進入點 (cron 每小時觸發)。對每位已引導使用者,依其當地時間決定要推哪些通知。

const WEEK_DAYS = 7;

/** 睡前完全沒記錄時的輕提醒 (不顯示收支卡,避免「0 攝取」被誤算成大赤字達標)。 */
function bedtimeNudge(): object {
  return {
    type: 'text',
    text: '🌙 今天還沒記錄喔，睡前花 10 秒補上吧！\n例如「晚餐 700」或「運動 300」。',
  };
}

/** 組出某種通知要推播的訊息;沒有可推內容時回空陣列 (例如該日無記錄)。 */
async function buildMessages(
  env: Env,
  user: User,
  kind: NotifyKind,
  today: string,
): Promise<object[]> {
  if (kind === 'bedtime') {
    const summary = await computeDaySummary(env, user, today, false);
    if (summary.intake === 0 && summary.burn === 0) return [bedtimeNudge()];
    return [daySummaryFlex('睡前收支 🌙', user, summary, env.LIFF_URL)];
  }

  if (kind === 'daily') {
    const yesterday = addDays(today, -1);
    const summary = await computeDaySummary(env, user, yesterday, true);
    if (summary.intake === 0 && summary.burn === 0) return []; // 昨天完全沒記錄就不打擾
    return [daySummaryFlex('昨日總結 ☀️', user, summary, env.LIFF_URL)];
  }

  // weekly:涵蓋昨日往回 7 天 (週一推時即上週一~週日)。
  const from = addDays(today, -WEEK_DAYS);
  const to = addDays(today, -1);
  const totals = await getDailyTotals(env, user.lineUserId, from, to);
  const summary = summarizeWeek([...totals.values()], user.tdee, user.targetDeficit);
  if (summary.daysLogged === 0) return [];
  return [weeklyMessage(summary, from, to)];
}

async function notifyUser(env: Env, user: User, now: Date): Promise<void> {
  const parts = localParts(user.tz, now);
  for (const kind of dueNotifications(user.bedtimeHour, parts)) {
    // 先佔位去重:首次標記才推,避免 cron 重跑造成重複推播。
    const first = await markNotified(env, user.lineUserId, parts.date, kind);
    if (!first) continue;
    const messages = await buildMessages(env, user, kind, parts.date);
    if (messages.length > 0) {
      await pushMessage(env.LINE_CHANNEL_ACCESS_TOKEN, user.lineUserId, messages);
    }
  }
}

/** cron 進入點:逐一處理使用者,單一使用者出錯不影響其他人。 */
export async function runScheduled(env: Env, now: Date): Promise<void> {
  const users = await getOnboardedUsers(env);
  await Promise.all(
    users.map((user) =>
      notifyUser(env, user, now).catch((err) =>
        console.error('notify error', user.lineUserId, err),
      ),
    ),
  );
}
