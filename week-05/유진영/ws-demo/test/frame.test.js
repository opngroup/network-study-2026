'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { acceptFor, encodeFrame, decodeFrame, closePayload, parseClose } = require('../lib/frame');

test('RFC 6455 1.3의 예: 키 → Accept', () => {
  assert.equal(acceptFor('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('RFC 6455 5.7의 예: 마스크 없는 "Hello"', () => {
  const f = encodeFrame({ opcode: 0x1, payload: 'Hello' });
  assert.equal(f.toString('hex'), '810548656c6c6f');
});

test('RFC 6455 5.7의 예: 마스크 씌운 "Hello" 읽기', () => {
  const f = decodeFrame(Buffer.from('818537fa213d7f9f4d5158', 'hex'));
  assert.equal(f.masked, true);
  assert.equal(f.payload.toString(), 'Hello');
  assert.equal(f.size, 11);
});

test('마스크를 씌워 보내면 다시 읽었을 때 원래 글', () => {
  const f = decodeFrame(encodeFrame({ opcode: 0x1, payload: '안녕', mask: true }));
  assert.equal(f.masked, true);
  assert.equal(f.payload.toString(), '안녕');
  assert.equal(f.headerBytes, 6); // 2바이트 머리 + 4바이트 마스크 키
});

test('길이 칸: 125까지 1바이트, 126~65535는 126 + 2바이트, 그 위는 127 + 8바이트', () => {
  assert.equal(encodeFrame({ opcode: 2, payload: Buffer.alloc(125) })[1], 125);
  const mid = encodeFrame({ opcode: 2, payload: Buffer.alloc(1000) });
  assert.equal(mid[1], 126);
  assert.equal(mid.readUInt16BE(2), 1000);
  const big = encodeFrame({ opcode: 2, payload: Buffer.alloc(70000) });
  assert.equal(big[1], 127);
  assert.equal(Number(big.readBigUInt64BE(2)), 70000);
  assert.equal(decodeFrame(big).payload.length, 70000);
});

test('아직 다 안 온 프레임은 null (TCP는 바이트를 나눠 줄 수 있다)', () => {
  const f = encodeFrame({ opcode: 1, payload: 'Hello', mask: true });
  for (let i = 0; i < f.length; i++) assert.equal(decodeFrame(f.subarray(0, i)), null);
  assert.ok(decodeFrame(f));
});

test('close 본문: 코드 2바이트 + 이유', () => {
  const p = closePayload(1000, 'bye');
  assert.equal(p.toString('hex'), '03e8627965');
  assert.deepEqual(parseClose(p), { code: 1000, reason: 'bye' });
  assert.deepEqual(parseClose(Buffer.alloc(0)), { code: 1005, reason: '' });
});
