#!/usr/bin/env node
/**
 * 과제 A 테스트용 클라이언트 (Node.js, 표준 모듈 `net`만 사용)
 * ------------------------------------------------------------------
 * 에코 서버에 클라이언트 여러 개를 "동시에" 붙여서,
 * 각 연결의 출발지 포트가 서로 다르다는 것을 눈으로 확인한다.
 *
 * 실행
 *   node echo_client.js                                # 127.0.0.1:9000 에 3개
 *   node echo_client.js --count 5
 *   node echo_client.js --host 192.168.0.10 --count 1  # 다른 기기의 서버에 접속
 *
 * 출력 예
 *   client#1  출발지 127.0.0.1:46950  ->  127.0.0.1:9000  답장 "hello from client#1"
 *   client#2  출발지 127.0.0.1:46942  ->  127.0.0.1:9000  답장 "hello from client#2"
 *   client#3  출발지 127.0.0.1:46958  ->  127.0.0.1:9000  답장 "hello from client#3"
 *
 * 목적지(127.0.0.1:9000)는 셋 다 같지만 출발지 포트가 다르다.
 * TCP 연결은 (출발지 IP, 출발지 포트, 목적지 IP, 목적지 포트) 네 값의 조합으로 구분되므로,
 * 서버는 포트 9000 하나로 세 연결을 따로 다룰 수 있다.
 */

'use strict';

const net = require('node:net');
const { parseArgs } = require('node:util');

const { values: opts } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '9000' },
    count: { type: 'string', default: '3' },
  },
});
const HOST = opts.host;
const PORT = Number(opts.port);
const COUNT = Number(opts.count);

/**
 * 서버에 연결 하나를 맺고, 연결된 소켓을 돌려준다.
 * 연결에 실패하면(서버가 없거나, 그 주소에서 기다리지 않으면) 에러로 끝난다.
 */
function connect(id) {
  return new Promise((resolve, reject) => {
    // createConnection은 우리 쪽 출발지 포트를 직접 고르지 않는다.
    // 운영체제가 비어 있는 임시 포트 하나를 골라 준다.
    const socket = net.createConnection({ host: HOST, port: PORT });
    socket.setTimeout(3000); // 3초 안에 연결이 안 되면 포기

    socket.once('connect', () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`client#${id} 연결 시간 초과`));
    });
    socket.once('error', (err) => {
      // 예: ECONNREFUSED = 그 주소·포트에서 기다리는 서버가 없다.
      //     서버가 127.0.0.1에만 바인딩돼 있는데 다른 IP로 접속하면 이 에러가 난다.
      reject(new Error(`client#${id} 연결 실패: ${err.code ?? err.message}`));
    });
  });
}

/** 메시지 하나를 보내고 답장 한 번을 기다린다. */
function sendAndReceive(socket, message) {
  return new Promise((resolve, reject) => {
    socket.once('data', (chunk) => resolve(chunk.toString('utf8').replace(/\n$/, '')));
    socket.once('error', reject);
    socket.write(message);
  });
}

async function main() {
  const ids = Array.from({ length: COUNT }, (_, i) => i + 1);

  // 1) 먼저 모든 클라이언트를 연결한다.
  //    Promise.all로 동시에 출발시키므로, 어느 연결이 먼저 끝날지는 정해져 있지 않다.
  let sockets;
  try {
    sockets = await Promise.all(ids.map(connect));
  } catch (err) {
    console.log(err.message);
    process.exitCode = 1;
    return;
  }

  // 2) 모두 연결된 상태에서 동시에 메시지를 보내고 답장을 받는다.
  //    이 시점에 서버에는 연결 COUNT개가 동시에 살아 있다.
  const results = await Promise.all(
    sockets.map(async (socket, i) => {
      const reply = await sendAndReceive(socket, `hello from client#${ids[i]}\n`);
      return { id: ids[i], socket, reply };
    }),
  );

  // 3) 결과 출력. localPort가 우리 쪽(출발지) 포트다.
  for (const { id, socket, reply } of results) {
    console.log(
      `client#${id}  출발지 ${socket.localAddress}:${socket.localPort}` +
        `  ->  ${socket.remoteAddress}:${socket.remotePort}  답장 ${JSON.stringify(reply)}`,
    );
  }

  // 4) 연결을 정상 종료한다(FIN 전송).
  //    클라이언트가 먼저 끊었으므로 TIME_WAIT는 클라이언트 쪽에 남는다.
  //    `netstat -an | grep 9000` (또는 리눅스 `ss -tan | grep 9000`)으로 확인할 수 있다. → 과제 B
  for (const { socket } of results) socket.end();
}

main();
