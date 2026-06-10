// LINE LIFF id_token 驗證 → line user id (sub)。
// LIFF 前端用 liff.getIDToken() 取得 JWT,後端拿去 LINE verify 端點換出身分,
// 才能安全地把資料隔離到對應使用者 (不能信任前端自報 userId)。

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

/**
 * 純函式:解析 LINE verify 端點的回應 → userId(sub)。
 * verify 端點本身已驗過 JWT 簽章與發行者;這裡再做縱深防禦:
 * - aud 必須等於我們的 channel id (token 是發給本服務的)
 * - exp 必須未過期
 * 任一不符或缺欄位回 null。
 */
export function parseVerifyResponse(
  body: unknown,
  expectedChannelId: string,
  nowSec: number,
): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.sub !== 'string' || b.sub === '') return null;
  if (b.aud !== expectedChannelId) return null;
  if (typeof b.exp !== 'number' || b.exp <= nowSec) return null;
  return b.sub;
}

/** 向 LINE 驗證 id_token,回 userId 或 null (驗證失敗一律回 null,由呼叫端轉 401)。 */
export async function verifyIdToken(
  channelId: string,
  idToken: string,
): Promise<string | null> {
  if (!channelId || !idToken) return null;
  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return parseVerifyResponse(body, channelId, Math.floor(Date.now() / 1000));
}
