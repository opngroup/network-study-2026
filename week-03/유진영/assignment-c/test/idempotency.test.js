'use strict';

// 멱등 키 저장소 단위 시험. 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { createIdempotencyStore } = require('../lib/idempotency');

const RESPONSE = Object.freeze({ status: 201, body: { id: 1 } });

test('처음 보는 키는 new를 돌려준다', () => {
  const store = createIdempotencyStore();
  assert.deepEqual(store.begin('k1', 'fp-a'), { state: 'new' });
});

test('끝난 키로 같은 요청이 다시 오면 처음 응답을 그대로 돌려준다', () => {
  const store = createIdempotencyStore();
  store.begin('k1', 'fp-a');
  store.complete('k1', RESPONSE);

  assert.deepEqual(store.begin('k1', 'fp-a'), { state: 'replay', response: RESPONSE });
});

test('같은 키에 본문이 다른 요청이 오면 mismatch', () => {
  const store = createIdempotencyStore();
  store.begin('k1', 'fp-a');
  store.complete('k1', RESPONSE);

  assert.deepEqual(store.begin('k1', 'fp-b'), { state: 'mismatch' });
});

test('첫 요청이 아직 처리 중이면 in_flight', () => {
  const store = createIdempotencyStore();
  store.begin('k1', 'fp-a');

  assert.deepEqual(store.begin('k1', 'fp-a'), { state: 'in_flight' });
});

test('처리 중 실패해 abort하면 같은 키로 다시 시도할 수 있다', () => {
  const store = createIdempotencyStore();
  store.begin('k1', 'fp-a');
  store.abort('k1');

  assert.deepEqual(store.begin('k1', 'fp-a'), { state: 'new' });
});

test('보관 시간이 지나면 키를 잊는다', () => {
  let now = 0;
  const store = createIdempotencyStore({ ttlMs: 1000, clock: () => now });
  store.begin('k1', 'fp-a');
  store.complete('k1', RESPONSE);

  now = 1001;
  assert.deepEqual(store.begin('k1', 'fp-a'), { state: 'new' });
});

test('돌려준 응답을 바꿔도 저장된 응답은 그대로다', () => {
  const store = createIdempotencyStore();
  store.begin('k1', 'fp-a');
  store.complete('k1', { status: 201, body: { id: 1 } });

  const first = store.begin('k1', 'fp-a').response;
  assert.throws(() => { first.body.id = 999; }, TypeError);
  assert.equal(store.begin('k1', 'fp-a').response.body.id, 1);
});
