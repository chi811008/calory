import type { Env } from './types';
import { verifySignature } from './line/client';
import { handleEvent } from './line/webhook';
import { runScheduled } from './handlers/notify';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return new Response('ok');
    }

    if (req.method === 'POST' && url.pathname === '/webhook') {
      const signature = req.headers.get('x-line-signature') ?? '';
      const body = await req.text();
      const ok = await verifySignature(env.LINE_CHANNEL_SECRET, body, signature);
      if (!ok) return new Response('invalid signature', { status: 401 });

      const payload = JSON.parse(body) as { events?: unknown[] };
      const events = payload.events ?? [];
      // 先回 200 給 LINE,事件在背景處理 (replyToken 有效約 30 秒)。
      ctx.waitUntil(
        Promise.all(
          events.map((e) =>
            handleEvent(e, env).catch((err) => console.error('event error', err)),
          ),
        ),
      );
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  },

  // 每小時觸發:依使用者當地時間推播睡前提醒 / 日報 / 週報。
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(env, new Date()));
  },
};
