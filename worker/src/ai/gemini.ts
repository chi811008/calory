import { normalizeEstimate, type PhotoEstimate } from '../domain/photo';

// Gemini 視覺辨識:估算食物照片的熱量。回傳正規化後的估算,失敗一律回 null。
// 注意:模型名與端點可能隨 Google 更新而變動,集中為常數方便調整。

const GEMINI_MODEL = 'gemini-2.5-flash';

const PROMPT =
  '你是營養估算助手。看這張食物照片,估算整份餐點的「總熱量(大卡)」與「簡短中文品名」。' +
  '只回傳 JSON,格式為 {"label":"品名","calories":整數大卡}。' +
  '若看不出是食物,calories 請回 0。';

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
    generationConfig: { responseMimeType: 'application/json' },
  };
  return callGemini(apiKey, body);
}

export async function estimateCalories(
  apiKey: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<PhotoEstimate | null> {
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mime, data: bytesToBase64(bytes) } },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json' },
  };
  return callGemini(apiKey, body);
}
