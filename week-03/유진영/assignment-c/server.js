#!/usr/bin/env node
/**
 * 과제 C 앱 서버
 * ------------------------------------------------------------------
 * HTTP 프레임워크 없이 node:http만으로 만든 작은 주문 API.
 *
 *   POST /orders           주문 만들기. Idempotency-Key 헤더 필수. ?delayMs=로 일부러 느리게 할 수 있다
 *   GET  /orders           주문 목록 (몇 건 생겼는지 세기용)
 *   GET  /orders/:id       주문 하나
 *   GET  /slow?ms=3000     그만큼 기다렸다 응답 → nginx proxy_read_timeout보다 길면 504
 *   GET  /boom             핸들러가 예외를 던진다 → 500
 *   GET  /crash            응답 없이 연결을 끊는다 → nginx 502 (upstream prematurely closed)
 *   GET  /health           살아 있는지
 *
 * 실행
 *   node server.js                     # 0.0.0.0:3000 (docker에서 nginx가 붙으려면 0.0.0.0이어야 한다. 3주차 장표 12)
 *   HOST=127.0.0.1 node server.js      # 일부러 바인딩 실수를 재현할 때
 */

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { createIdempotencyStore } = require('./lib/idempotency');

const MAX_BODY_BYTES = 16 * 1024;
const MAX_DELAY_MS = 60_000;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toDelay(raw) {
  const ms = Number(raw ?? 0);
  if (!Number.isFinite(ms) || ms < 0) throw new HttpError(400, 'INVALID_DELAY', 'ms·delayMs는 0 이상의 숫자');
  return Math.min(ms, MAX_DELAY_MS);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'BODY_TOO_LARGE', '본문이 너무 큽니다'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseOrderInput(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'JSON을 읽을 수 없습니다');
  }
  const { item, qty } = data ?? {};
  if (typeof item !== 'string' || item.trim() === '' || item.length > 100) {
    throw new HttpError(422, 'INVALID_ITEM', 'item은 1~100자 문자열');
  }
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
    throw new HttpError(422, 'INVALID_QTY', 'qty는 1~100 정수');
  }
  return { item: item.trim(), qty };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

/**
 * @param {{ log?: (line: string) => void }} [options]
 * @returns {http.Server}
 */
function createApp({ log = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const idempotency = createIdempotencyStore();
  /** @type {Map<number, Readonly<{id:number,item:string,qty:number,createdAt:string}>>} */
  const orders = new Map();
  let nextId = 1;

  async function createOrder(req, res, url) {
    const key = req.headers['idempotency-key'];
    if (!key) throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key 헤더가 필요합니다');

    const raw = await readBody(req);
    const input = parseOrderInput(raw);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

    const found = idempotency.begin(key, fingerprint);
    if (found.state === 'replay') {
      log(`[orders] key=${key} → 처음 응답을 다시 보냄 (새 주문 없음)`);
      send(res, found.response.status, found.response.body, { 'idempotent-replayed': 'true' });
      return;
    }
    if (found.state === 'in_flight') {
      throw new HttpError(409, 'REQUEST_IN_PROGRESS', '같은 키의 요청을 처리 중입니다. 잠시 뒤 다시 보내세요');
    }
    if (found.state === 'mismatch') {
      throw new HttpError(422, 'IDEMPOTENCY_KEY_REUSED', '같은 키로 다른 내용을 보냈습니다');
    }

    try {
      await sleep(toDelay(url.searchParams.get('delayMs')));
      const order = Object.freeze({ id: nextId++, ...input, createdAt: new Date().toISOString() });
      orders.set(order.id, order);
      idempotency.complete(key, { status: 201, body: order });
      log(`[orders] key=${key} → 주문 #${order.id} 생성`);
      send(res, 201, order, { location: `/orders/${order.id}` });
    } catch (err) {
      idempotency.abort(key);
      throw err;
    }
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (req.method === 'GET' && pathname === '/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && pathname === '/orders') return createOrder(req, res, url);
    if (req.method === 'GET' && pathname === '/orders') return send(res, 200, [...orders.values()]);

    const match = pathname.match(/^\/orders\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const order = orders.get(Number(match[1]));
      if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', '그런 주문이 없습니다');
      return send(res, 200, order);
    }

    if (req.method === 'GET' && pathname === '/slow') {
      const ms = toDelay(url.searchParams.get('ms') ?? 3000);
      log(`[slow] ${ms}ms 기다리는 중`);
      await sleep(ms);
      log(`[slow] ${ms}ms 끝, 응답 보냄`);
      return send(res, 200, { waitedMs: ms });
    }

    if (req.method === 'GET' && pathname === '/boom') {
      throw new Error('일부러 던진 예외 (/boom)');
    }

    if (req.method === 'GET' && pathname === '/crash') {
      // 응답 헤더를 한 줄도 안 보내고 TCP 연결을 끊는다. 처리 중 앱이 죽는 상황 흉내 → nginx 502
      log('[crash] 응답 없이 연결을 끊음');
      req.socket.destroy();
      return undefined;
    }

    throw new HttpError(404, 'NOT_FOUND', '그런 경로가 없습니다');
  }

  return http.createServer(async (req, res) => {
    const requestId = req.headers['x-request-id'] ?? crypto.randomUUID();
    try {
      await route(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        send(res, err.status, { code: err.code, message: err.message, requestId });
        return;
      }
      log(`[error] requestId=${requestId} ${err.stack}`);
      send(res, 500, { code: 'INTERNAL_ERROR', message: '서버 내부 오류', requestId });
    }
  });
}

if (require.main === module) {
  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 3000);
  const server = createApp();
  server.listen(port, host, () => process.stdout.write(`앱 서버 대기 중: ${host}:${port}\n`));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

module.exports = { createApp };
