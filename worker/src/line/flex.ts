import type { DayResult } from '../domain/calories';
import { dailyPraise, nearMissLine, overAchieveLine } from '../domain/praise';
import { weightProgress, KCAL_PER_KG } from '../domain/weight';

// 即時回饋卡 (Flex Message)。遊戲化的核心視覺:大數字 + 進度條 + 連續天數。

const COLOR = {
  met: '#16A34A', // 綠:達標
  near: '#F59E0B', // 琥珀:還沒達標但有赤字
  over: '#DC2626', // 紅:吃超標
  track: '#E5E7EB', // 進度條底色
  weight: '#7C3AED', // 靛紫:累進公斤進度條 (與每日綠色區隔)
  sub: '#6B7280', // 次要文字
  text: '#111827',
} as const;

export interface FeedbackData {
  headline: string;
  date?: string; // 達標金句依日期輪替;省略則不顯示金句
  settled?: boolean; // 是否已結算 (可慶祝達標);進行中改顯示「還可以吃 X 卡」額度。預設 true (向後相容)
  result: DayResult;
  intake: number;
  tdee: number;
  exerciseBurn: number;
  targetDeficit: number;
  streak: number;
  badge?: string | null;
  cumulativeDeficit?: number; // 全程累積淨赤字;有給才顯示「距離下一公斤」進度
  liffUrl?: string;
}

function row(label: string, value: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: COLOR.sub, flex: 0 },
      { type: 'text', text: value, size: 'sm', color: COLOR.text, align: 'end' },
    ],
  };
}

/** 水平進度條。pct 為 0..100 的填滿百分比 (呼叫端自行夾在範圍內)。 */
function progressBar(pct: number, color: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    height: '14px',
    backgroundColor: COLOR.track,
    cornerRadius: '7px',
    contents: [
      ...(pct > 0
        ? [
            {
              type: 'box',
              layout: 'vertical',
              width: `${pct}%`,
              backgroundColor: color,
              cornerRadius: '7px',
              contents: [{ type: 'filler' }],
            },
          ]
        : []),
      { type: 'filler' },
    ],
  };
}

export function feedbackFlex(d: FeedbackData): object {
  const { result } = d;

  const settled = d.settled ?? true;
  // 還可以吃多少仍能達標 (負值 = 已吃超出達標額度)。進行中的核心數字。
  const budget = result.deficit - d.targetDeficit;

  // 今日可吃額度 = 支出 (基礎＋運動) − 目標赤字。運動越多額度越大,長條反而退一點讓你多吃。
  // 長條代表「已吃 ÷ 可吃額度」:滿格 = 吃到上限,再吃就超標。
  const allowance = result.expenditure - d.targetDeficit;
  const eatenPct =
    allowance > 0 ? Math.round(Math.min(d.intake / allowance, 1) * 100) : d.intake > 0 ? 100 : 0;

  let statusText: string;
  let statusColor: string;
  let barColor: string;
  // 達標慶祝句 (金句/彩蛋/安慰),僅在「結算」後出現,進行中不慶祝。
  const flair: string[] = [];

  if (!settled) {
    // 進行中:一律前瞻,告訴你還剩多少額度,不對達標下定論 (赤字只會隨進食變小)。
    if (result.deficit < 0) {
      statusText = `🚨 已吃超過總消耗 ${-result.deficit} 卡`;
      statusColor = COLOR.over;
      barColor = COLOR.over;
    } else if (budget >= 0) {
      statusText = `👍 還可以吃 ${budget} 卡仍達標`;
      statusColor = COLOR.met;
      barColor = COLOR.met;
    } else {
      statusText = `⚠️ 已超出達標額度 ${-budget} 卡,動一動補回來`;
      statusColor = COLOR.near;
      barColor = COLOR.near;
    }
  } else if (result.deficit < 0) {
    statusText = `⚠️ 今天吃超標 ${-result.deficit} 卡`;
    statusColor = COLOR.over;
    barColor = COLOR.over;
  } else if (result.met) {
    statusText = `🎉 達標!赤字 ${result.deficit} 卡`;
    statusColor = COLOR.met;
    barColor = COLOR.met;
    if (d.date) flair.push(dailyPraise(d.date));
    const bonus = overAchieveLine(result.deficit, d.targetDeficit);
    if (bonus) flair.push(bonus);
  } else {
    statusText = `差 ${result.remaining} 卡沒達標`;
    statusColor = COLOR.near;
    barColor = COLOR.near;
    const near = nearMissLine(result.remaining);
    if (near) flair.push(near);
  }

  const detailRows: object[] = [
    row('攝取', `${d.intake} 卡`),
    row('支出', `${result.expenditure} 卡 (基礎 ${d.tdee}＋運動 ${d.exerciseBurn})`),
    row('赤字', `${result.deficit} 卡 / 目標 ${d.targetDeficit}`),
    row('連續達標', d.streak > 0 ? `🔥 ${d.streak} 天` : '尚未開始'),
  ];

  // 全程累積淨赤字 → 換算減重公斤,並在減重方向顯示「距離下一公斤」終點線。
  const progress =
    d.cumulativeDeficit !== undefined ? weightProgress(d.cumulativeDeficit) : null;
  if (progress) {
    const dir = progress.kg >= 0 ? '減' : '增';
    detailRows.push(
      row('累積淨赤字', `${d.cumulativeDeficit} 卡 ≈ ${dir} ${Math.abs(progress.kg).toFixed(2)} kg`),
    );
  }

  const bodyContents: object[] = [
    { type: 'text', text: d.headline, size: 'sm', color: COLOR.sub },
    { type: 'text', text: statusText, weight: 'bold', size: 'xl', color: statusColor, wrap: true },
    progressBar(eatenPct, barColor),
    {
      type: 'text',
      text: `已吃 ${d.intake} / 可吃 ${Math.max(allowance, 0)} 卡`,
      size: 'xs',
      color: COLOR.sub,
      align: 'end',
    },
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      margin: 'lg',
      contents: detailRows,
    },
  ];

  // 累進公斤進度條:本公斤已走的卡數 ÷ 7700。只在減重方向 (kg>0) 顯示,避免增重時誤導。
  if (progress && progress.kg > 0) {
    const kgPct = Math.round((progress.withinKcal / KCAL_PER_KG) * 100);
    bodyContents.push(
      { type: 'text', text: '距離下一公斤', size: 'sm', color: COLOR.sub, margin: 'lg' },
      progressBar(kgPct, COLOR.weight),
      {
        type: 'text',
        text: `🎯 再 ${progress.remainingKcal} 卡達成下一公斤`,
        size: 'sm',
        color: COLOR.weight,
        align: 'center',
        wrap: true,
        margin: 'sm',
      },
    );
  }

  for (const line of flair) {
    bodyContents.push({
      type: 'text',
      text: line,
      size: 'sm',
      color: result.met ? COLOR.met : COLOR.near,
      align: 'center',
      wrap: true,
      margin: 'md',
    });
  }

  if (d.badge) {
    bodyContents.push({
      type: 'text',
      text: d.badge,
      weight: 'bold',
      size: 'md',
      color: COLOR.met,
      align: 'center',
      margin: 'lg',
    });
  }

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: bodyContents },
  };

  if (d.liffUrl) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: COLOR.met,
          action: { type: 'uri', label: '📊 看圖表', uri: d.liffUrl },
        },
      ],
    };
  }

  return { type: 'flex', altText: statusText, contents: bubble };
}

/** 看不懂的指令時回的使用說明。 */
export function helpMessage(): object {
  return {
    type: 'text',
    text: [
      '🍱 卡路里赤字小幫手',
      '',
      '直接打字記錄（可一次多行多筆）:',
      '• 餐點：午餐 600 / 早餐 燕麥 350',
      '• 餐別：早餐 / 午餐 / 晚餐 / 點心 / 飲料',
      '• 多筆：',
      '   早餐 水煮蛋 80',
      '   酸種麵包 150',
      '   飲料 拿鐵 130',
      '• 沒打數字：午餐 滷肉飯小碗 → 幫你查範本或估算',
      '• 運動：運動 300 / 跑步 250',
      '• 拍照：直接傳食物照片，我幫你估熱量 📷',
      '',
      '常吃的存起來，下次直接叫名字:',
      '• 存 滷肉飯小碗 450　• 範本　• 刪範本 滷肉飯小碗',
      '',
      '記錯要改（打「今日」看編號）:',
      '• 改 2 500　• 刪 3',
      '',
      '運動記錄（打「運動清單」看編號）:',
      '• 運動清單　• 改運動 2 250　• 刪運動 3',
      '',
      '記體重看變化曲線（儀表板）:',
      '• 體重 70　• 體重（查最近一次）',
      '',
      '查看今日：今天 / 進度',
      '想算出專屬的每日消耗，打「設定」💪',
    ].join('\n'),
  };
}
