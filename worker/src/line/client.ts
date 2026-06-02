// LINE Messaging API 呼叫與簽章驗證。

const LINE_API = 'https://api.line.me/v2/bot';
const LINE_DATA_API = 'https://api-data.line.me/v2/bot';

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** 定速字串比較,避免時序側通道。 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** 驗證 LINE webhook 的 X-Line-Signature (HMAC-SHA256 → base64)。 */
export async function verifySignature(
  channelSecret: string,
  body: string,
  signature: string,
): Promise<boolean> {
  if (!channelSecret || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    strToBytes(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, strToBytes(body));
  return safeEqual(bufToBase64(mac), signature);
}

export async function replyMessage(
  token: string,
  replyToken: string,
  messages: unknown[],
): Promise<void> {
  const res = await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    console.error('LINE reply failed', res.status, await res.text());
  }
}

export async function pushMessage(
  token: string,
  to: string,
  messages: unknown[],
): Promise<void> {
  const res = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    console.error('LINE push failed', res.status, await res.text());
  }
}

/** 下載圖片訊息的二進位內容 (走 api-data 網域)。失敗擲錯,由 handler 轉成友善訊息。 */
export async function getMessageContent(
  token: string,
  messageId: string,
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const res = await fetch(`${LINE_DATA_API}/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`LINE content fetch failed: ${res.status}`);
  }
  const mime = res.headers.get('content-type') ?? 'image/jpeg';
  const bytes = await res.arrayBuffer();
  return { bytes, mime };
}
