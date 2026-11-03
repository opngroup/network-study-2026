#!/usr/bin/env node
/**
 * 체크 ② TIME_WAIT는 어느 쪽에 남나
 * ------------------------------------------------------------------
 * 서버와 클라이언트를 이 스크립트 안에서 둘 다 띄우고, 한 번 대화한 뒤 한쪽이 먼저 끊는다.
 * 그다음 운영체제의 TCP 연결 표(netstat이 보여 주는 그 표)를 2초마다 읽어서
 * "이 연결의 어느 쪽 끝이 어떤 상태인지"를 출력한다.
 *
 * 실행
 *   node time_wait_check.js                    # 클라이언트가 먼저 끊는 경우 (nc에서 Ctrl+C 와 같음)
 *   node time_wait_check.js --closer server    # 서버가 먼저 끊는 경우 (HTTP Connection: close 와 같음)
 *   node time_wait_check.js --max 70           # 최대 70초까지 지켜보기 (기본 70)
 *
 * 알아 둘 것
 *   - TIME_WAIT 지속 시간은 운영체제마다 다르다. 리눅스 60초, macOS 약 30초(MSL 15초 × 2), Windows 기본 240초.
 *   - 같은 포트 쌍이 표에 두 줄 나온다. 하나는 서버 쪽 끝(내 포트 = 서버 포트),
 *     하나는 클라이언트 쪽 끝(내 포트 = 임시 포트)이다. 한 줄이 사라지면 그쪽 끝은 정리가 끝난 것이다.
 */

'use strict';

const net = require('node:net');
const { parseArgs } = require('node:util');
const { readTcpTable } = require('./lib/tcp_table');

const { values: opts } = parseArgs({
  options: {
    closer: { type: 'string', default: 'client' }, // 누가 먼저 끊나: client | server
    port: { type: 'string', default: '9200' },
    max: { type: 'string', default: '70' },        // 최대 몇 초 지켜볼지
    every: { type: 'string', default: '2' },       // 몇 초마다 볼지
  },
});
const PORT = Number(opts.port);
const CLOSER = opts.closer === 'server' ? 'server' : 'client';

// ── 서버: 받은 걸 돌려주고, closer=server면 그 직후 자기가 먼저 끊는다 ──
const server = net.createServer((sock) => {
  sock.on('data', (chunk) => {
    sock.write(chunk);
    if (CLOSER === 'server') sock.end(); // 서버가 먼저 FIN을 보낸다
  });
  sock.on('error', () => {});
});

server.listen(PORT, '127.0.0.1', () => {
  // ── 클라이언트: 연결 → hello → (closer=client면) 먼저 끊기 ──
  const client = net.createConnection({ host: '127.0.0.1', port: PORT });
  let clientPort;
  client.on('connect', () => {
    clientPort = client.localPort;
    console.log(`연결: 클라이언트 127.0.0.1:${clientPort}  ↔  서버 127.0.0.1:${PORT}`);
    console.log(`먼저 끊는 쪽: ${CLOSER === 'client' ? '클라이언트' : '서버'}\n`);
    client.write('hello\n');
  });
  client.on('data', () => {
    if (CLOSER === 'client') client.end(); // 클라이언트가 먼저 FIN을 보낸다
  });
  client.on('close', () => {
    server.close();         // 새 연결은 그만 받는다 (이미 끝난 연결의 TIME_WAIT와는 상관없다)
    watch(clientPort);
  });
});

/** 운영체제 연결 표에서 이 포트 쌍의 두 끝을 찾아 상태를 출력한다. */
function watch(clientPort) {
  const start = Date.now();
  const every = Number(opts.every) * 1000;
  const max = Number(opts.max) * 1000;

  console.log(`경과      서버 쪽 끝 (${PORT}→${clientPort})       클라이언트 쪽 끝 (${clientPort}→${PORT})`);
  const tick = () => {
    const rows = readTcpTable();
    const serverEnd = rows.find((r) => r.localPort === PORT && r.remotePort === clientPort);
    const clientEnd = rows.find((r) => r.localPort === clientPort && r.remotePort === PORT);
    const sec = ((Date.now() - start) / 1000).toFixed(1).padStart(5);
    const show = (r) => (r ? r.state : '(없음)').padEnd(28);
    console.log(`${sec}초   ${show(serverEnd)} ${show(clientEnd)}`);

    if (!serverEnd && !clientEnd) {
      console.log('\n양쪽 모두 표에서 사라졌다. 연결 정리가 완전히 끝났다.');
      return;
    }
    if (Date.now() - start >= max) {
      console.log(`\n${opts.max}초까지 지켜봤다. --max 로 더 길게 볼 수 있다.`);
      return;
    }
    setTimeout(tick, every);
  };
  tick();
}
