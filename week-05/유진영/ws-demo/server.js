#!/usr/bin/env node
/**
 * 5주차 발표 데모: 라이브러리 없이 만든 WebSocket 서버
 * ------------------------------------------------------------------
 * node:http의 'upgrade' 이벤트로 핸드셰이크를 받고, 그 뒤 TCP 소켓에서 프레임을 직접 읽는다.
 * 오가는 프레임을 16진수와 뜻으로 터미널에 찍어서 "선 위에 실제로 뭐가 지나가나"를 보여 준다.
 *
 *   GET /          브라우저 데모 페이지 (public/index.html)
 *   GET /ws        WebSocket 핸드셰이크 → 101 Switching Protocols
 *
 * 받은 메시지
 *   text    모두에게 돌려 보낸다 (방송)
 *   binary  보낸 사람에게만 돌려 보낸다
 *   ping    같은 본문으로 pong
 *   close   같은 코드로 close를 돌려주고 TCP를 닫는다
 *
 * 서버가 먼저 말하기: 서버 터미널에 글을 쳐서 엔터를 치면 모두에게 보낸다.
 * 하트비트: HEARTBEAT_MS마다 ping을 보내고, 다음 차례까지 pong이 없으면 죽은 연결로 보고 끊는다.
 *
 * 출처(Origin) 검사: 브라우저는 핸드셰이크에 Origin을 알아서 붙인다. WebSocket은 CORS를 받지 않으므로
 * 다른 사이트의 페이지가 사용자의 쿠키를 싣고 붙는 것(교차 사이트 WebSocket 하이재킹)을 서버가 막아야 한다.
 * 같은 호스트에서 연 페이지와 ALLOWED_ORIGINS에 적은 출처만 받고, 나머지는 403. Origin이 없으면(curl, Node
 * 클라이언트처럼 브라우저가 아닌 것) 받는다. 브라우저가 아닌 것은 Origin을 마음대로 쓸 수 있어서 인증을 대신하지 못한다.
 *
 * 실행
 *   node server.js                          # 0.0.0.0:8081
 *   PORT=9000 HEARTBEAT_MS=5000 node server.js
 *   QUIET=1 node server.js                  # 프레임 로그 끄기 (시험용)
 *   ALLOWED_ORIGINS=http://192.168.0.10:8081 node server.js   # 다른 주소로 연 페이지도 허락
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const {
  acceptFor,
  encodeFrame,
  decodeFrame,
  closePayload,
  parseClose,
  FrameError,
  hex,
  describe,
} = require('./lib/frame');

const MAX_MESSAGE_BYTES = 1024 * 1024;
const SUBPROTOCOL = 'demo.v1';

function createServer({ heartbeatMs = 15_000, quiet = false, allowedOrigins = [] } = {}) {
  const log = quiet ? () => {} : (...args) => console.log(...args);
  const clients = new Map(); // id → { socket, alive, send }
  let nextId = 1;

  const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(page);
      return;
    }
    if (req.url === '/ws') {
      // Upgrade 헤더 없이 /ws로 온 보통 HTTP 요청
      res.writeHead(426, { 'content-type': 'text/plain; charset=utf-8', upgrade: 'websocket', connection: 'Upgrade' });
      res.end('WebSocket 핸드셰이크가 필요합니다 (Upgrade: websocket)\n');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
  });

  server.on('upgrade', (req, socket, head) => {
    const reject = (status, text, extra = '') => {
      socket.end(`HTTP/1.1 ${status} ${text}\r\n${extra}content-type: text/plain\r\nconnection: close\r\n\r\n${text}\n`);
      log(`✗ 핸드셰이크 거절: ${status} ${text}`);
    };

    const upgrade = (req.headers.upgrade || '').toLowerCase();
    const connection = (req.headers.connection || '').toLowerCase().split(',').map((s) => s.trim());
    const key = req.headers['sec-websocket-key'];
    const version = req.headers['sec-websocket-version'];

    if (req.url !== '/ws') return reject(404, 'Not Found');
    if (req.method !== 'GET') return reject(405, 'Method Not Allowed');
    if (upgrade !== 'websocket' || !connection.includes('upgrade')) return reject(400, 'Bad Request');
    if (version !== '13') return reject(426, 'Upgrade Required', 'sec-websocket-version: 13\r\n');
    if (!key || Buffer.from(key, 'base64').length !== 16) return reject(400, 'Bad Request');

    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}` && !allowedOrigins.includes(origin)) {
      return reject(403, 'Forbidden');
    }

    const offered = (req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const protocol = offered.includes(SUBPROTOCOL) ? SUBPROTOCOL : null;

    const id = nextId++;
    const accept = acceptFor(key);
    const lines = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
    ];
    if (protocol) lines.push(`Sec-WebSocket-Protocol: ${protocol}`);
    socket.write(lines.join('\r\n') + '\r\n\r\n');

    log(`\n── #${id} 핸드셰이크 (${req.socket.remoteAddress}:${req.socket.remotePort}) ──`);
    log(`요청  GET ${req.url} HTTP/${req.httpVersion}`);
    for (const h of ['host', 'upgrade', 'connection', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions', 'origin']) {
      if (req.headers[h]) log(`      ${h}: ${req.headers[h]}`);
    }
    log(`계산  base64(SHA-1("${key}" + "258EAFA5-…")) = ${accept}`);
    log(`응답  ${lines.join('\n      ')}`);
    log('── 여기부터 HTTP가 아니라 WebSocket 프레임 ──');

    socket.setNoDelay(true);
    const client = { id, socket, alive: true, closing: false, pingSentAt: 0 };

    client.send = (opcode, payload) => {
      if (socket.destroyed) return;
      const frame = encodeFrame({ opcode, payload });
      socket.write(frame);
      log(`→ #${id} ${hex(frame)}   ${describe(decodeFrame(frame))}${preview(opcode, payload)}`);
    };
    client.close = (code, reason = '') => {
      if (client.closing) return;
      client.closing = true;
      client.send(0x8, closePayload(code, reason));
    };
    clients.set(id, client);

    let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    let fragments = null; // 조각난 메시지: { opcode, parts: [] }

    const onFrame = (frame) => {
      log(`← #${id} ${hex(frame.raw)}   ${describe(frame)}${preview(frame.opcode, frame.payload)}`);
      if (!frame.masked) throw new FrameError(1002, '클라이언트 프레임에 마스크가 없습니다');
      if (frame.rsv) throw new FrameError(1002, '약속하지 않은 RSV 비트');

      const isControl = frame.opcode >= 0x8;
      if (isControl && (!frame.fin || frame.payload.length > 125)) throw new FrameError(1002, '제어 프레임은 125바이트 이하, 조각내지 않음');

      switch (frame.opcode) {
        case 0x9: // ping
          client.send(0xa, frame.payload);
          return;
        case 0xa: // pong
          client.alive = true;
          if (client.pingSentAt) log(`   #${id} pong까지 ${Date.now() - client.pingSentAt}ms`);
          return;
        case 0x8: { // close
          const { code, reason } = parseClose(frame.payload);
          log(`   #${id} 상대가 닫자고 함: ${code} ${reason}`);
          if (!client.closing) client.close(code === 1005 ? 1000 : code, reason);
          socket.end();
          return;
        }
        case 0x1:
        case 0x2:
          if (fragments) throw new FrameError(1002, '앞 메시지 조각이 끝나기 전에 새 메시지');
          if (!frame.fin) {
            fragments = { opcode: frame.opcode, parts: [frame.payload], size: frame.payload.length };
            return;
          }
          return onMessage(frame.opcode, frame.payload);
        case 0x0:
          if (!fragments) throw new FrameError(1002, '이어 붙일 메시지가 없는 continuation');
          if (fragments.size + frame.payload.length > MAX_MESSAGE_BYTES) throw new FrameError(1009, '메시지가 너무 큽니다');
          fragments.parts.push(frame.payload);
          fragments.size += frame.payload.length;
          if (frame.fin) {
            const { opcode, parts } = fragments;
            fragments = null;
            onMessage(opcode, Buffer.concat(parts));
          }
          return;
        default:
          throw new FrameError(1002, `모르는 opcode ${frame.opcode}`);
      }
    };

    const onMessage = (opcode, payload) => {
      if (opcode === 0x1) {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(payload); // 잘못된 UTF-8이면 예외 → 1007
        broadcast(`#${id}: ${text}`);
      } else {
        client.send(0x2, payload);
      }
    };

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        for (;;) {
          const frame = decodeFrame(buf, MAX_MESSAGE_BYTES);
          if (!frame) break;
          buf = buf.subarray(frame.size);
          onFrame(frame);
        }
      } catch (err) {
        const code = err instanceof FrameError ? err.code : err instanceof TypeError ? 1007 : 1011;
        log(`✗ #${id} ${err.message} → close ${code}`);
        client.close(code, err.message.slice(0, 100));
        socket.end();
      }
    });
    socket.on('end', () => {
      // 상대가 close 프레임 없이 TCP만 닫음(FIN). 반쯤 열린 채 두지 말고 우리도 닫는다 → 상대 쪽 close 코드는 1006
      if (!client.closing) log(`   #${id} close 프레임 없이 TCP가 끊김 (브라우저라면 1006)`);
      socket.end();
    });
    socket.on('close', () => {
      clients.delete(id);
      log(`   #${id} TCP 연결 닫힘 (남은 연결 ${clients.size}개)`);
    });
    socket.on('error', (err) => log(`   #${id} 소켓 오류: ${err.code || err.message}`));
  });

  function broadcast(text) {
    for (const c of clients.values()) if (!c.closing) c.send(0x1, text);
  }

  let timer = null;
  if (heartbeatMs > 0) {
    timer = setInterval(() => {
      for (const c of clients.values()) {
        if (!c.alive) {
          log(`✗ #${c.id} 지난 ping에 pong이 없음 → 죽은 연결로 보고 끊는다`);
          c.socket.destroy();
          continue;
        }
        c.alive = false;
        c.pingSentAt = Date.now();
        c.send(0x9, String(c.pingSentAt));
      }
    }, heartbeatMs);
    timer.unref();
  }

  server.on('close', () => clearInterval(timer));
  return { server, clients, broadcast };
}

function preview(opcode, payload) {
  if (opcode === 0x1) return `  "${payload.toString('utf8').slice(0, 40)}"`;
  if (opcode === 0x8) {
    const { code, reason } = parseClose(payload);
    return `  code=${code}${reason ? ` "${reason}"` : ''}`;
  }
  if (opcode === 0x9 || opcode === 0xa) return payload.length ? `  "${payload.toString('utf8')}"` : '';
  return '';
}

module.exports = { createServer, MAX_MESSAGE_BYTES };

if (require.main === module) {
  const port = Number(process.env.PORT || 8081);
  const host = process.env.HOST || '0.0.0.0';
  const { server, broadcast } = createServer({
    heartbeatMs: Number(process.env.HEARTBEAT_MS ?? 15_000),
    quiet: process.env.QUIET === '1',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  });
  server.listen(port, host, () => {
    console.log(`WebSocket 데모 서버: http://localhost:${port}/  (핸드셰이크 주소 ws://localhost:${port}/ws)`);
    console.log('여기에 글을 치고 엔터 → 서버가 먼저 모두에게 보낸다');
  });
  if (process.stdin.isTTY) {
    readline.createInterface({ input: process.stdin }).on('line', (line) => {
      if (line.trim()) broadcast(`[서버] ${line.trim()}`);
    });
  }
}
