#!/usr/bin/env node
/**
 * 체크 ③ keep-alive를 켜고 끄고 요청 100번 보내기
 * ------------------------------------------------------------------
 * 같은 요청을 연달아 보내면서
 *   켬(on):  연결 하나를 계속 다시 쓴다 (HTTP/1.1 기본 동작)
 *   끔(off): 요청마다 "Connection: close"를 붙여, 응답 후 연결을 닫고 다음 요청은 새로 연결한다
 * 두 경우의 걸린 시간과 실제로 만든 TCP 연결 수를 비교한다.
 *
 * 실행
 *   node keepalive_bench.js                                  # 이 컴퓨터 안의 테스트 서버로 (루프백)
 *   node keepalive_bench.js --count 50 --rounds 5
 *   node keepalive_bench.js --url https://example.com/ --count 20   # 인터넷 너머 서버로
 *
 * 왜 두 가지로 재나
 *   루프백은 왕복 시간이 0.05ms 수준이라 핸드셰이크를 100번 해도 몇 ms밖에 안 걸린다. 차이가 잘 안 보인다.
 *   인터넷 너머 서버는 왕복이 수십 ms이고 HTTPS라면 TLS 인사까지 다시 해야 해서 차이가 크게 벌어진다.
 *
 * 주의
 *   - Node의 https 모듈은 HTTP/1.1로만 말한다. 그래서 Connection: close가 그대로 먹힌다.
 *     (curl은 HTTPS에서 HTTP/2로 붙을 수 있는데, HTTP/2는 Connection 헤더를 쓰지 않아 --http1.1로 고정해야 비교된다)
 *   - 남의 서버에 너무 많이 보내지 않도록 --url을 쓸 때는 --count를 20 정도로 작게 둔다.
 */

'use strict';

const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');
const { parseArgs } = require('node:util');
const { readTcpTable } = require('./lib/tcp_table');

const { values: opts } = parseArgs({
  options: {
    url: { type: 'string' },                     // 생략하면 내장 테스트 서버
    count: { type: 'string', default: '100' },   // 한 번에 보낼 요청 수
    rounds: { type: 'string', default: '3' },    // 켬·끔을 번갈아 몇 번 잴지
    port: { type: 'string', default: '8765' },
  },
});
const COUNT = Number(opts.count);
const ROUNDS = Number(opts.rounds);

/** 요청 하나를 보내고 응답을 끝까지 받는다. 이 요청이 새 소켓(=새 TCP 연결)을 썼는지 알려 준다. */
function request(url, agent, keepAlive, seen) {
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(url, {
      agent,
      headers: keepAlive ? {} : { Connection: 'close' },
    }, (res) => {
      res.resume();                 // 본문은 버린다(끝까지 읽어야 연결을 다시 쓸 수 있다)
      res.on('end', resolve);
    });
    // agent가 소켓을 다시 쓰면 같은 소켓 객체가 온다. 처음 보는 소켓이면 새 연결을 만든 것이다.
    req.on('socket', (s) => seen.add(s));
    req.on('error', reject);
    req.end();
  });
}

/** 요청 COUNT번을 순서대로 보내고 걸린 시간과 연결 수를 잰다. */
async function run(url, keepAlive) {
  // maxSockets: 1 → 동시에 소켓 하나만. 요청을 한 줄로 세워 순서대로 보낸다.
  const agent = new (url.protocol === 'https:' ? https : http).Agent({ keepAlive, maxSockets: 1 });
  const seen = new Set();
  const t0 = performance.now();
  for (let i = 0; i < COUNT; i++) await request(url, agent, keepAlive, seen);
  const ms = performance.now() - t0;
  agent.destroy();
  return { ms, connections: seen.size };
}

async function main() {
  let server;
  let serverConnections = 0;
  let url;

  if (opts.url) {
    url = new URL(opts.url);
  } else {
    // 내장 테스트 서버: "ok" 두 글자만 돌려준다. 새 TCP 연결이 생길 때마다 센다.
    server = http.createServer((req, res) => res.end('ok'));
    server.on('connection', () => serverConnections++);
    await new Promise((r) => server.listen(Number(opts.port), '127.0.0.1', r));
    url = new URL(`http://127.0.0.1:${opts.port}/`);
  }

  console.log(`대상: ${url.href}   요청 ${COUNT}번씩, ${ROUNDS}회 반복\n`);
  console.log('회차  keep-alive  걸린 시간      요청당     새 TCP 연결');
  const results = { on: [], off: [] };
  for (let r = 1; r <= ROUNDS; r++) {
    for (const mode of ['on', 'off']) {
      const { ms, connections } = await run(url, mode === 'on');
      results[mode].push(ms);
      console.log(
        `${String(r).padStart(3)}   ${mode === 'on' ? '켬 ' : '끔 '}        ${ms.toFixed(1).padStart(8)} ms  ` +
          `${(ms / COUNT).toFixed(3).padStart(7)} ms   ${String(connections).padStart(4)}개`,
      );
    }
  }

  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const on = median(results.on);
  const off = median(results.off);
  console.log(`\n중앙값  켬 ${on.toFixed(1)} ms / 끔 ${off.toFixed(1)} ms  →  끔이 ${(off / on).toFixed(2)}배`);

  if (server) {
    console.log(`테스트 서버가 받은 TCP 연결 총 ${serverConnections}개`);
    // 끔 모드에서는 서버가 응답 후 먼저 연결을 닫는다 → TIME_WAIT가 서버 쪽 끝에 쌓인다.
    const rows = readTcpTable().filter((x) => x.state === 'TIME_WAIT');
    const serverSide = rows.filter((x) => x.localPort === Number(opts.port)).length;
    const clientSide = rows.filter((x) => x.remotePort === Number(opts.port)).length;
    console.log(`지금 TIME_WAIT: 서버 쪽 끝(${opts.port}→임시포트) ${serverSide}개, 클라이언트 쪽 끝(임시포트→${opts.port}) ${clientSide}개`);
    server.close();
  }
}

main().catch((err) => {
  console.error(`실패: ${err.code ?? err.message}`);
  process.exitCode = 1;
});
