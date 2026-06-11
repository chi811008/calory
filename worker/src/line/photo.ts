import type { PhotoEstimate } from '../domain/photo';

// 拍照辨識的 LINE 訊息。估算後用 Quick Reply 讓使用者點選餐別或取消。

/** 估算結果 + 選餐別的 Quick Reply。 */
export function photoEstimateMessage(estimate: PhotoEstimate): object {
  const labels = ['早餐', '午餐', '晚餐', '點心', '飲料', '取消'];
  return {
    type: 'text',
    text: `📷 看起來是「${estimate.label}」，估計約 ${estimate.calories} 卡。\n要記到哪一餐？`,
    quickReply: {
      items: labels.map((label) => ({
        type: 'action',
        action: { type: 'message', label, text: label },
      })),
    },
  };
}

/** 辨識失敗 (抓圖或模型出錯、看不出食物) 的友善提示。 */
export function photoFailedMessage(): object {
  return {
    type: 'text',
    text: '😅 這張圖我看不太出熱量。\n換一張清楚一點的照片，或直接打字記錄，例如「午餐 600」。',
  };
}

export function photoCanceledMessage(): object {
  return { type: 'text', text: '已取消這張照片的記錄 👍' };
}
