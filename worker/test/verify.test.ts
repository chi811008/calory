import { describe, it, expect } from 'vitest';
import { parseVerifyResponse } from '../src/line/verify';

const CHANNEL = '1234567890';
const NOW = 1_700_000_000;

describe('parseVerifyResponse', () => {
  it('回傳 sub 當 aud 相符且未過期', () => {
    const body = { sub: 'Uabc123', aud: CHANNEL, exp: NOW + 3600 };
    expect(parseVerifyResponse(body, CHANNEL, NOW)).toBe('Uabc123');
  });

  it('aud 不符 (token 發給別的 channel) → null', () => {
    const body = { sub: 'Uabc123', aud: '9999', exp: NOW + 3600 };
    expect(parseVerifyResponse(body, CHANNEL, NOW)).toBeNull();
  });

  it('已過期 → null', () => {
    const body = { sub: 'Uabc123', aud: CHANNEL, exp: NOW - 1 };
    expect(parseVerifyResponse(body, CHANNEL, NOW)).toBeNull();
  });

  it('缺少 sub → null', () => {
    expect(parseVerifyResponse({ aud: CHANNEL, exp: NOW + 1 }, CHANNEL, NOW)).toBeNull();
    expect(parseVerifyResponse({ sub: '', aud: CHANNEL, exp: NOW + 1 }, CHANNEL, NOW)).toBeNull();
  });

  it('LINE 錯誤回應 (error 欄位) 或非物件 → null', () => {
    expect(parseVerifyResponse({ error: 'invalid_request' }, CHANNEL, NOW)).toBeNull();
    expect(parseVerifyResponse(null, CHANNEL, NOW)).toBeNull();
    expect(parseVerifyResponse('nope', CHANNEL, NOW)).toBeNull();
  });
});
