import type { DayResult } from '../domain/calories';
import { dailyPraise, nearMissLine, overAchieveLine } from '../domain/praise';

// 即時回饋卡 (Flex Message)。遊戲化的核心視覺:大數字 + 進度條 + 連續天數。

const COLOR = {
  met: '#16A34A', // 綠:達標
  near: '#F59E0B', // 琥珀:還沒達標但有赤字
  over: '#DC2626', // 紅:吃超標
  track: '#E5E7EB', // 進度條底色
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

export function feedbackFlex(d: FeedbackData): object {
  const { result } = d;
  const pct = Math.round(result.progress * 100);

  const settled = d.settled ?? true;
  // 還可以吃多少仍能達標 (負值 = 已吃超出達標額度)。進行中的核心數字。
  const budget = result.deficit - d.targetDeficit;

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

  const bar = {
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
              backgroundColor: barColor,
              cornerRadius: '7px',
              contents: [{ type: 'filler' }],
            },
          ]
        : []),
      { type: 'filler' },
    ],
  };

  const bodyContents: object[] = [
    { type: 'text', text: d.headline, size: 'sm', color: COLOR.sub },
    { type: 'text', text: statusText, weight: 'bold', size: 'xl', color: statusColor, wrap: true },
    bar,
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      margin: 'lg',
      contents: [
        row('攝取', `${d.intake} 卡`),
        row('支出', `${result.expenditure} 卡 (基礎 ${d.tdee}＋運動 ${d.exerciseBurn})`),
        row('赤字', `${result.deficit} 卡 / 目標 ${d.targetDeficit}`),
        row('連續達標', d.streak > 0 ? `🔥 ${d.streak} 天` : '尚未開始'),
      ],
    },
  ];

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
      '• 多筆：',
      '   早餐 水煮蛋 80',
      '   酸種麵包 150',
      '   午餐 便當 700',
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
      '查看今日：今天 / 進度',
      '想算出專屬的每日消耗，打「設定」💪',
    ].join('\n'),
  };
}
