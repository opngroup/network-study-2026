'use strict';

// 앱 서버 통합 시험. 진짜 HTTP로 띄워 fetch로 부른다. 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

async function withServer(fn) {
  const server = createApp({ log: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function postOrder(base, { key, body = { item: 'coffee', qty: 1 }, query = '' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['idempotency-key'] = key;
  return fetch(`${base}/orders${query}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

test('같은 Idempotency-Key로 두 번 보내도 주문은 하나만 생긴다', () => withServer(async (base) => {
  const first = await postOrder(base, { key: 'abc' });
  const second = await postOrder(base, { key: 'abc' });

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(second.headers.get('idempotent-replayed'), 'true');
  assert.deepEqual(await second.json(), await first.json());

  const list = await (await fetch(`${base}/orders`)).json();
  assert.equal(list.length, 1);
}));

test('키가 다르면 주문이 따로 생긴다', () => withServer(async (base) => {
  await postOrder(base, { key: 'a' });
  await postOrder(base, { key: 'b' });
  const list = await (await fetch(`${base}/orders`)).json();
  assert.equal(list.length, 2);
}));

test('Idempotency-Key가 없으면 400', () => withServer(async (base) => {
  const res = await postOrder(base, {});
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');
}));

test('같은 키에 다른 본문이면 422', () => withServer(async (base) => {
  await postOrder(base, { key: 'k' });
  const res = await postOrder(base, { key: 'k', body: { item: 'tea', qty: 2 } });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).code, 'IDEMPOTENCY_KEY_REUSED');
}));

test('첫 요청이 처리 중일 때 같은 키가 오면 409', () => withServer(async (base) => {
  const slow = postOrder(base, { key: 'k', query: '?delayMs=300' });
  await new Promise((r) => setTimeout(r, 50));
  const res = await postOrder(base, { key: 'k', query: '?delayMs=300' });
  assert.equal(res.status, 409);
  assert.equal((await slow).status, 201);
}));

test('JSON이 깨지면 400, 값이 틀리면 422', () => withServer(async (base) => {
  const broken = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'x' },
    body: '{not json',
  });
  assert.equal(broken.status, 400);

  const invalid = await postOrder(base, { key: 'y', body: { item: 'coffee', qty: -1 } });
  assert.equal(invalid.status, 422);
}));

test('GET /orders/:id는 있으면 200, 없으면 404', () => withServer(async (base) => {
  const created = await (await postOrder(base, { key: 'k' })).json();
  assert.equal((await fetch(`${base}/orders/${created.id}`)).status, 200);
  assert.equal((await fetch(`${base}/orders/9999`)).status, 404);
}));

test('/boom은 500과 requestId를 돌려준다', () => withServer(async (base) => {
  const res = await fetch(`${base}/boom`, { headers: { 'x-request-id': 'req-1' } });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), {
    code: 'INTERNAL_ERROR', message: '서버 내부 오류', requestId: 'req-1',
  });
}));

test('/slow?ms=는 그만큼 기다렸다 200', () => withServer(async (base) => {
  const started = Date.now();
  const res = await fetch(`${base}/slow?ms=200`);
  assert.equal(res.status, 200);
  assert.ok(Date.now() - started >= 190);
}));

test('/crash는 응답 없이 연결을 끊는다', () => withServer(async (base) => {
  await assert.rejects(fetch(`${base}/crash`), TypeError);
}));

// ---------------- 과제 D: ETag · 304 · If-Match ----------------

async function createOne(base, key = 'etag-k') {
  return (await postOrder(base, { key })).json();
}

function patchOrder(base, id, body, headers = {}) {
  return fetch(`${base}/orders/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('GET /orders/:id는 ETag와 Cache-Control: private, no-cache를 준다', () => withServer(async (base) => {
  const order = await createOne(base);
  const res = await fetch(`${base}/orders/${order.id}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('etag'), /^"[0-9a-f]{20}"$/);
  assert.equal(res.headers.get('cache-control'), 'private, no-cache');
}));

test('같은 ETag로 다시 물으면 304, 본문은 0바이트', () => withServer(async (base) => {
  const order = await createOne(base);
  const first = await fetch(`${base}/orders/${order.id}`);
  const etag = first.headers.get('etag');
  await first.text();

  const second = await fetch(`${base}/orders/${order.id}`, { headers: { 'if-none-match': etag } });
  assert.equal(second.status, 304);
  assert.equal(second.headers.get('etag'), etag);
  assert.equal((await second.arrayBuffer()).byteLength, 0);
}));

test('PATCH하면 ETag가 바뀌고, 옛 ETag로 물으면 200과 새 본문', () => withServer(async (base) => {
  const order = await createOne(base);
  const oldEtag = (await fetch(`${base}/orders/${order.id}`)).headers.get('etag');

  const patched = await patchOrder(base, order.id, { qty: 3 }, { 'if-match': oldEtag });
  assert.equal(patched.status, 200);
  const newEtag = patched.headers.get('etag');
  assert.notEqual(newEtag, oldEtag);
  assert.equal((await patched.json()).qty, 3);

  const again = await fetch(`${base}/orders/${order.id}`, { headers: { 'if-none-match': oldEtag } });
  assert.equal(again.status, 200);
  assert.equal(again.headers.get('etag'), newEtag);
  assert.equal((await again.json()).qty, 3);
}));

test('옛 ETag로 If-Match PATCH하면 412, 주문은 그대로', () => withServer(async (base) => {
  const order = await createOne(base);
  const oldEtag = (await fetch(`${base}/orders/${order.id}`)).headers.get('etag');
  await patchOrder(base, order.id, { qty: 2 });            // 다른 사람이 먼저 고쳤다

  const stale = await patchOrder(base, order.id, { qty: 9 }, { 'if-match': oldEtag });
  assert.equal(stale.status, 412);
  assert.equal((await stale.json()).code, 'PRECONDITION_FAILED');

  const now = await (await fetch(`${base}/orders/${order.id}`)).json();
  assert.equal(now.qty, 2);
}));

test('If-None-Match: 쉼표 목록, *, W/ 약한 비교', () => withServer(async (base) => {
  const order = await createOne(base);
  const etag = (await fetch(`${base}/orders/${order.id}`)).headers.get('etag');
  const ask = (value) => fetch(`${base}/orders/${order.id}`, { headers: { 'if-none-match': value } });

  assert.equal((await ask(`"nope", ${etag}`)).status, 304);   // 목록 중 하나만 맞아도
  assert.equal((await ask('*')).status, 304);                  // 자원이 있으면 맞음
  assert.equal((await ask(`W/${etag}`)).status, 304);          // W/를 떼고 비교
  assert.equal((await ask('"nope"')).status, 200);
}));

test('If-Match: *는 통과, W/는 강한 비교라 412', () => withServer(async (base) => {
  const order = await createOne(base);
  const etag = (await fetch(`${base}/orders/${order.id}`)).headers.get('etag');

  const weak = await patchOrder(base, order.id, { qty: 4 }, { 'if-match': `W/${etag}` });
  assert.equal(weak.status, 412);
  const star = await patchOrder(base, order.id, { qty: 5 }, { 'if-match': '*' });
  assert.equal(star.status, 200);
}));

test('없는 주문 PATCH는 404, 빈 PATCH는 422', () => withServer(async (base) => {
  assert.equal((await patchOrder(base, 999, { qty: 1 })).status, 404);
  const order = await createOne(base);
  assert.equal((await patchOrder(base, order.id, {})).status, 422);
}));
