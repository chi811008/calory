import type { PhotoEstimate } from '../domain/photo';

// 拍照辨識的 LINE 訊息。對話式流程:收到照片 → 問補充 → 估算 → 儲存 → 選餐別。

/** Quick Reply 工具:把 label 陣列轉成 message action (label 即送出文字)。 */
function quickReply(labels: string[]): object {
  return {
    items: labels.map((label) => ({
      type: 'action',
      action: { type: 'message', label, text: label },
    })),
  };
}

/** 收到照片後:先問要不要補充描述,提供「直接估算」與「放棄」。 */
export function askDescribeMessage(): object {
  return {
    type: 'text',
    text:
      '📷 收到照片！要補充什麼嗎？\n' +
      '可以打品名或份量,例如「無糖冰咖啡」「花魚一夜干 一片」,我會連同照片一起判讀。\n' +
      '不用補充就按〔直接估算〕。',
    quickReply: quickReply(['直接估算', '放棄']),
  };
}

/** 估算結果 + 「儲存 / 放棄」的 Quick Reply。想再補充直接打字即可 (會重估)。 */
export function photoEstimateMessage(estimate: PhotoEstimate): object {
  return {
    type: 'text',
    text: `${photoEstimateText(estimate)}\n要存嗎？想再補充就直接打字,或按〔儲存〕。`,
    quickReply: quickReply(['儲存', '放棄']),
  };
}

/** 使用者按儲存後:選餐別的 Quick Reply。 */
export function askMealMessage(): object {
  return {
    type: 'text',
    text: '要記到哪一餐？',
    quickReply: quickReply(['早餐', '午餐', '晚餐', '點心', '飲料', '放棄']),
  };
}

/** 照片內容已從 LINE 取不回 (久放過期):請使用者重傳。 */
export function photoExpiredMessage(): object {
  return {
    type: 'text',
    text: '😅 這張照片已經過期、抓不回來了,再傳一次就好 📷',
  };
}

/** 估算的文字主體:有明細列每一項 + 合計,沒有則退回單行。 */
function photoEstimateText(estimate: PhotoEstimate): string {
  const head = `📷 看起來是「${estimate.label}」，估計約 ${estimate.calories} 卡`;
  if (!estimate.items || estimate.items.length === 0) return `${head}。`;
  const lines = estimate.items.map(
    (i) => `・${i.label} 約${i.grams}g  ${i.calories}卡`,
  );
  return `${head}：\n${lines.join('\n')}`;
}

/** 辨識失敗 (抓圖或模型出錯、看不出食物) 的友善提示。 */
export function photoFailedMessage(): object {
  return {
    type: 'text',
    text: '😅 這張圖我看不太出熱量。\n小技巧：斜約45度拍、把手或餐具放旁邊當比例尺，會更準。\n或直接打字記錄，例如「午餐 600」。',
  };
}

export function photoCanceledMessage(): object {
  return { type: 'text', text: '已取消這張照片的記錄 👍' };
}
