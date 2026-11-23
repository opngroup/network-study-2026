'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { createServer, MAX_MESSAGE_BYTES } = require('../server');
const { encodeFrame, decodeFrame } = require('../lib/frame');

function start(opts = {}) {
  const { server } = createServer({ quiet: true, heartbeatMs: 0, ...opts });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
const url = (s) => `ws://127.0.0.1:${s.address().port}/ws`;

/** 날것의 TCP로 핸드셰이크를 보내고 응답 머리와 그 뒤 바이트를 받는다 */
function raw(server, headers) {
  return new Promise((resolve) => {
    const sock = net.connect(server.address().port, '127.0.0.1');
    let buf = Buffer.alloc(0);
    sock.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      const end = buf.indexOf('\r\n\r\n');
      if (end >= 0) resolve({ sock, head: buf.subarray(0, end).toString(), rest: () => buf.subarray(end + 4) });
    });
    sock.write(`GET /ws HTTP/1.1\r\nHost: x\r\n${headers.join('\r\n')}\r\n\r\n`);
  });
}
const good = ['Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version: 13'];

test('핸드셰이크: 101과 RFC 예시 Accept', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { sock, head } = await raw(s, good);
  sock.destroy();
  assert.match(head, /^HTTP\/1\.1 101 Switching Protocols/);
  assert.match(head, /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/);
});

test('핸드셰이크 거절: 버전이 틀리면 426 + 지원 버전', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { sock, head } = await raw(s, good.map((h) => h.replace('Version: 13', 'Version: 8')));
  sock.destroy();
  assert.match(head, /^HTTP\/1\.1 426/);
  assert.match(head, /sec-websocket-version: 13/i);
});

test('핸드셰이크 거절: Upgrade 헤더 없이 /ws는 426 (보통 HTTP)', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const res = await fetch(`http://127.0.0.1:${s.address().port}/ws`);
  assert.equal(res.status, 426);
});

test('브라우저와 같은 WebSocket API: 글 방송, 바이너리 되돌림, 하위 프로토콜, 깨끗한 close', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const ws = new WebSocket(url(s), ['demo.v1']);
  ws.binaryType = 'arraybuffer';
  const got = [];
  const closed = new Promise((r) => (ws.onclose = r));
  ws.onmessage = (e) => {
    got.push(e.data);
    if (got.length === 2) ws.close(1000, 'bye');
  };
  await new Promise((r) => (ws.onopen = r));
  assert.equal(ws.protocol, 'demo.v1');
  ws.send('Hi');
  ws.send(new Uint8Array([1, 2, 3, 255]));
  const e = await closed;
  assert.equal(got[0], '#1: Hi');
  assert.deepEqual([...new Uint8Array(got[1])], [1, 2, 3, 255]);
  assert.equal(e.code, 1000);
  assert.equal(e.wasClean, true);
});

test('서버는 ping에 같은 본문으로 pong', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { sock, rest } = await raw(s, good);
  sock.write(encodeFrame({ opcode: 0x9, payload: 'abc', mask: true }));
  await new Promise((r) => setTimeout(r, 100));
  const f = decodeFrame(rest());
  sock.destroy();
  assert.equal(f.opcode, 0xa);
  assert.equal(f.masked, false); // 서버 → 클라이언트는 마스크 없음
  assert.equal(f.payload.toString(), 'abc');
});

test('마스크 없는 클라이언트 프레임은 close 1002로 끊는다', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { sock, rest } = await raw(s, good);
  sock.write(encodeFrame({ opcode: 0x1, payload: 'Hi', mask: false }));
  await new Promise((r) => setTimeout(r, 100));
  const f = decodeFrame(rest());
  sock.destroy();
  assert.equal(f.opcode, 0x8);
  assert.equal(f.payload.readUInt16BE(0), 1002);
});

test('조각난 메시지(FIN=0 → continuation)를 이어 붙인다', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { sock, rest } = await raw(s, good);
  sock.write(encodeFrame({ opcode: 0x1, payload: 'Hel', fin: false, mask: true }));
  sock.write(encodeFrame({ opcode: 0x9, payload: 'p', mask: true })); // 조각 사이에 끼어든 제어 프레임
  sock.write(encodeFrame({ opcode: 0x0, payload: 'lo', fin: true, mask: true }));
  await new Promise((r) => setTimeout(r, 100));
  let buf = rest();
  const frames = [];
  for (let f; (f = decodeFrame(buf)); buf = buf.subarray(f.size)) frames.push(f);
  sock.destroy();
  assert.deepEqual(frames.map((f) => [f.opcode, f.payload.toString()]), [[0xa, 'p'], [0x1, '#1: Hello']]);
});

test('하트비트: pong이 안 오면 다음 차례에 연결을 끊는다', async (t) => {
  const s = await start({ heartbeatMs: 100 });
  t.after(() => s.close());
  const { sock } = await raw(s, good); // 날것 소켓은 pong을 알아서 보내지 않는다
  const closedAt = await new Promise((r) => sock.on('close', () => r(Date.now())));
  assert.ok(closedAt);
});

test('출처 검사: 다른 사이트의 Origin은 403, 같은 호스트와 Origin 없음은 101', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const evil = await raw(s, [...good, 'Origin: https://evil.example']);
  evil.sock.destroy();
  assert.match(evil.head, /^HTTP\/1\.1 403/);
  const same = await raw(s, [...good, 'Origin: http://x']); // raw()는 Host: x를 보낸다
  same.sock.destroy();
  assert.match(same.head, /^HTTP\/1\.1 101/);
});

test('허락 목록에 넣은 출처는 받는다', async (t) => {
  const s = await start({ allowedOrigins: ['https://app.example'] });
  t.after(() => s.close());
  const ok = await raw(s, [...good, 'Origin: https://app.example']);
  ok.sock.destroy();
  assert.match(ok.head, /^HTTP\/1\.1 101/);
});

test('머리에 적힌 길이가 한도를 넘으면 내용을 기다리지 않고 close 1009', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { sock, rest } = await raw(s, good);
  const head = Buffer.alloc(14);
  head[0] = 0x82;
  head[1] = 0x80 | 127;
  head.writeBigUInt64BE(BigInt(MAX_MESSAGE_BYTES + 1), 2); // 마스크 키 4바이트는 0
  sock.write(head); // 내용은 한 바이트도 안 보낸다
  await new Promise((r) => setTimeout(r, 100));
  const f = decodeFrame(rest());
  sock.destroy();
  assert.equal(f.opcode, 0x8);
  assert.equal(f.payload.readUInt16BE(0), 1009);
});
