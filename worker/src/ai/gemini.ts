import { normalizeEstimate, type PhotoEstimate } from '../domain/photo';

// Gemini 視覺辨識:估算食物照片的熱量。回傳正規化後的估算,失敗一律回 null。
// 注意:模型名與端點可能隨 Google 更新而變動,集中為常數方便調整。

const GEMINI_MODEL = 'gemini-2.5-flash';

const PROMPT =
  '你是專業營養估算助手。請逐項拆解這張食物照片並估算熱量。\n' +
  '【步驟】\n' +
  '1. 列出照片中每一樣可辨識的食物(主食、蛋白質、配菜、醬料、飲料分開列)。\n' +
  '2. 估計每樣的份量(公克),依序用以下線索校準:\n' +
  '   - 比例尺:照片中若有一隻成人手掌(掌寬約10公分),用它校準食物的平面大小;' +
  '並可用「手掌≈一份肉(約100g)、拳頭≈一碗飯」輔助。\n' +
  '   - 容器:辨識盛裝容器(碗/盤/杯/便當盒)推估體積,例如標準碗≈200g熟飯、便當盒依分格估各格份量。\n' +
  '   - 角度:斜約45度拍攝可看出高度;若為正上方俯拍,高度不明時請採該容器的常見標準份量,不要假設食物堆得很高。\n' +
  '3. 考慮烹調方式:油炸、勾芡、淋醬、奶油會明顯增加熱量,水煮、清蒸較低。\n' +
  '4. 估計每樣食物的熱量(大卡)。\n' +
  '【輸出】只回傳 JSON,格式為:\n' +
  '{"label":"整份餐點的簡短中文品名","items":[{"label":"品名","grams":整數公克,"calories":整數大卡}]}\n' +
  '- label 用一句話概括整份(例:「雞腿便當」「牛肉麵」)。\n' +
  '- 每項 calories 為該項熱量;總熱量由系統加總,你不需自己加。\n' +
  '- 若看不出是食物,items 回空陣列 []。';

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000; // 分塊避免 String.fromCharCode 參數過多爆堆疊
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const TEXT_PROMPT =
  '你是營養估算助手。根據以下食物文字描述,估算「總熱量(大卡)」與「簡短中文品名」。' +
  '份量詞 (小碗/中份/一瓶) 請納入估算。只回傳 JSON,格式為 {"label":"品名","calories":整數大卡}。' +
  '若無法判斷是食物,calories 請回 0。食物描述:';

// 強制 JSON 輸出 + 關閉 thinking:估熱量不需內部推演 (邏輯已在輸出格式裡),關掉省一半延遲。
const GEN_CONFIG = {
  responseMimeType: 'application/json',
  thinkingConfig: { thinkingBudget: 0 },
};

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

async function callGemini(apiKey: string, body: unknown): Promise<PhotoEstimate | null> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('gemini request failed', res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') return null;

  try {
    return normalizeEstimate(JSON.parse(text));
  } catch (err) {
    console.error('gemini returned non-JSON', err);
    return null;
  }
}

/** 從文字食物描述估熱量 (沒給數字時用)。重用同一套正規化把關。失敗回 null。 */
export async function estimateCaloriesFromText(
  apiKey: string,
  label: string,
): Promise<PhotoEstimate | null> {
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }
  const body = {
    contents: [{ parts: [{ text: TEXT_PROMPT + label }] }],
    generationConfig: GEN_CONFIG,
  };
  return callGemini(apiKey, body);
}

export async function estimateCalories(
  apiKey: string,
  bytes: ArrayBuffer,
  mime: string,
  note?: string,
): Promise<PhotoEstimate | null> {
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  // 使用者補充 (品名/份量) 併入同一次視覺呼叫,作為校正線索而非取代判讀。
  const trimmed = note?.trim();
  const promptText = trimmed
    ? `${PROMPT}\n【使用者補充】${trimmed}\n請把上述補充當作品名與份量的校正線索,與照片一起判讀。`
    : PROMPT;

  const body = {
    contents: [
      {
        parts: [
          { text: promptText },
          { inline_data: { mime_type: mime, data: bytesToBase64(bytes) } },
        ],
      },
    ],
    generationConfig: GEN_CONFIG,
  };
  return callGemini(apiKey, body);
}
