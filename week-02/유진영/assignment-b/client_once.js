#!/usr/bin/env node
/**
 * 체크 ① 와이어샤크 캡처용 클라이언트
 * ------------------------------------------------------------------
 * 과제 A 에코 서버에 한 번 접속해서 hello를 보내고 끊는다.
 * 장면 사이에 1초씩 쉬어서, 와이어샤크 Time 열에서 세 장면이 또렷하게 나뉘어 보이게 한다.
 *
 *   ① 연결 (3-way handshake)   SYN → SYN, ACK → ACK
 *   ② 데이터 주고받기          hello 보내기 → 에코 받기
 *   ③ 연결 끊기                FIN 교환
 *
 * 실행 순서
 *   1. 와이어샤크에서 루프백 인터페이스(macOS: Loopback: lo0)를 고르고 캡처 시작
 *      화면 필터 칸에:  tcp.port == 9000
 *   2. 터미널 1:  node ../../../week-01/유진영/assignment-a/echo_server.js
 *   3. 터미널 2:  node client_once.js
 *   4. 와이어샤크 캡처 정지, 패킷 목록을 이 스크립트 출력과 맞춰 본다
 */

'use strict';

const net = require('node:net');
const { parseArgs } = require('node:util');

const { values: opts } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '9000' },
    pause: { type: 'string', default: '1000' }, // 장면 사이 쉬는 시간(ms)
  },
});
const PAUSE = Number(opts.pause);
const start = Date.now();
const t = () => `${((Date.now() - start) / 1000).toFixed(3)}s`;

const socket = net.createConnection({ host: opts.host, port: Number(opts.port) });

socket.on('connect', () => {
  // 여기 왔다면 SYN → SYN,ACK → ACK 가 이미 끝났다
  console.log(`${t()}  ① 연결됨  내 쪽 ${socket.localAddress}:${socket.localPort} → ${opts.host}:${opts.port}`);
  console.log(`         와이어샤크에서 포트 ${socket.localPort} 가 들어간 줄을 찾으면 된다`);
  setTimeout(() => {
    console.log(`${t()}  ② hello 보냄 (6바이트: h e l l o 줄바꿈)`);
    socket.write('hello\n');
  }, PAUSE);
});

socket.once('data', (chunk) => {
  console.log(`${t()}  ② 에코 받음 ${JSON.stringify(chunk.toString())}`);
  setTimeout(() => {
    console.log(`${t()}  ③ 내가 먼저 끊음 (FIN 보냄)`);
    socket.end();
  }, PAUSE);
});

socket.on('close', () => console.log(`${t()}  ③ 연결 완전히 닫힘. 먼저 끊은 내 쪽에 TIME_WAIT가 남는다`));
socket.on('error', (err) => {
  console.log(`연결 실패: ${err.code ?? err.message} (에코 서버를 먼저 켰는지 확인)`);
  process.exitCode = 1;
});
