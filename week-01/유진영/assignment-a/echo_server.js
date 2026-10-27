#!/usr/bin/env node
/**
 * 과제 A. TCP 에코 서버 (Node.js, 표준 모듈 `net`만 사용)
 * ------------------------------------------------------------------
 * 클라이언트가 보낸 바이트를 받은 그대로 돌려주는 서버다.
 * HTTP 프레임워크(Express 등)도, http 모듈도 쓰지 않는다. 그 아래층인 TCP 소켓을 직접 다룬다.
 *
 * 이 과제로 확인하려는 것
 *   1. 서버는 접속한 상대를 (IP, 포트)로 안다. 클라이언트 쪽 포트는 OS가 임시로 고른 번호다. (퀴즈 Q07)
 *   2. 서버가 어느 주소에 바인딩하느냐에 따라 어디서 접속할 수 있는지가 달라진다. (퀴즈 Q04, 1주차 발표)
 *
 * 실행
 *   node echo_server.js                          # 127.0.0.1:9000  (이 컴퓨터 안에서만 접속 가능)
 *   node echo_server.js --host 0.0.0.0           # 모든 IPv4 주소에서 접속 가능 (같은 와이파이의 다른 기기 등)
 *   node echo_server.js --host 0.0.0.0 --port 9100
 *
 * 접속해 보기 (다른 터미널)
 *   nc 127.0.0.1 9000          # 한 줄 입력하면 그대로 돌아온다. Ctrl+C로 끝낸다
 *   node echo_client.js        # 클라이언트 3개를 동시에 붙여 본다
 */

'use strict';

const net = require('node:net');
const { parseArgs } = require('node:util');

// ── 1. 명령줄 옵션 읽기 ─────────────────────────────────────────────
// --host: 바인딩할 주소. 기본값을 127.0.0.1로 둔 이유는 아래 4번 참고.
// --port: 기다릴 포트 번호. 1024 미만은 관리자 권한이 필요하니 9000을 쓴다.
const { values: opts } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '9000' },
  },
});
const HOST = opts.host;
const PORT = Number(opts.port);

/** 로그 한 줄에 현재 시각(HH:MM:SS)을 붙여 출력한다. */
function log(message) {
  const time = new Date().toTimeString().slice(0, 8);
  console.log(`[${time}] ${message}`);
}

// ── 2. 연결 하나를 처리하는 함수 ────────────────────────────────────
// net.createServer()에 넘긴 함수는 "새 연결이 생길 때마다" 한 번씩 불린다.
// 이 시점에는 이미 3-way handshake(SYN → SYN+ACK → ACK)가 끝나 있다.
// handshake는 우리 코드가 아니라 운영체제(커널)가 처리하고, 끝난 연결만 넘겨준다.
//
// 인자로 받는 socket은 "이 손님 한 명과의 전용 통로"다.
// 서버가 처음 연 소켓(LISTEN 상태)과는 별개의 소켓이고, 상태는 ESTABLISHED다.
function handleConnection(socket) {
  // 상대(클라이언트)의 주소와 포트.
  // remotePort는 클라이언트 쪽 OS가 임시 포트 범위(리눅스 32768~60999, macOS 49152~65535)에서 고른 번호다.
  const who = `${socket.remoteAddress}:${socket.remotePort}`;
  // 내 쪽(서버) 주소와 포트. 서버 포트는 모든 연결에서 같다 (예: 9000).
  const me = `${socket.localAddress}:${socket.localPort}`;
  log(`연결됨    client=${who}  ->  server=${me}`);

  // 'data': 상대가 보낸 바이트가 도착할 때마다 불린다.
  // 주의: TCP는 "메시지"가 아니라 끊김 없는 바이트 흐름이다.
  //   상대가 한 번 보낸 것이 여러 번의 'data'로 나뉘어 올 수도 있고,
  //   두 번 보낸 것이 한 번의 'data'로 합쳐져 올 수도 있다.
  //   에코 서버는 받은 만큼 그대로 돌려주면 되니 이 차이가 문제되지 않지만,
  //   채팅처럼 "메시지 단위"가 필요한 프로그램은 줄바꿈이나 길이 값으로 경계를 직접 정해야 한다.
  //   (WebSocket이 '프레임'이라는 단위를 따로 두는 이유. 5주차 주제)
  socket.on('data', (chunk) => {
    const text = chunk.toString('utf8').replace(/\r?\n$/, '');
    log(`받음      client=${who}  ${chunk.length}바이트  ${JSON.stringify(text)}`);

    // 받은 그대로 돌려준다(에코).
    // write()가 false를 돌려주면 "보낼 버퍼가 꽉 찼으니 잠깐 멈춰 달라"는 뜻이다(백프레셔, 2주차 발표).
    // 에코 서버는 받은 만큼만 보내므로, 상대가 못 따라오면 잠시 받기를 멈추고(pause)
    // 버퍼가 비면('drain') 다시 받는다(resume). 이렇게 하면 메모리가 한없이 늘지 않는다.
    const ok = socket.write(chunk);
    if (!ok) {
      socket.pause();
      socket.once('drain', () => socket.resume());
    }
  });

  // 'end': 상대가 "나는 더 보낼 게 없다"(FIN)를 보냈을 때.
  // Node는 기본적으로 이때 우리 쪽도 자동으로 연결을 닫는다(allowHalfOpen: false).
  socket.on('end', () => {
    log(`상대가 끊음 client=${who}`);
  });

  // 'close': 연결이 완전히 닫혔을 때. 정상 종료든 에러든 마지막에 한 번 불린다.
  socket.on('close', (hadError) => {
    log(`연결 닫힘  client=${who}${hadError ? '  (에러로 닫힘)' : ''}`);
  });

  // 'error': 상대가 갑자기 사라지는 등(ECONNRESET) 문제가 생겼을 때.
  // 이 리스너가 없으면 에러 하나에 서버 전체가 죽는다.
  socket.on('error', (err) => {
    log(`에러      client=${who}  ${err.code ?? err.message}`);
  });
}

// ── 3. 서버 만들기 ──────────────────────────────────────────────────
// Python 버전에서는 손님마다 스레드를 따로 만들었다. recv()가 데이터가 올 때까지 멈춰 있기 때문이다.
// Node는 이벤트 루프 하나가 모든 소켓을 지켜보다가, 데이터가 온 소켓의 콜백만 불러 준다.
// 그래서 스레드 없이도 여러 손님을 동시에 받는다.
const server = net.createServer(handleConnection);

// 서버 자체의 에러. 가장 흔한 것은 포트를 이미 누가 쓰고 있을 때(EADDRINUSE)다.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log(`${HOST}:${PORT} 는 이미 다른 프로그램이 쓰고 있습니다. --port 로 다른 번호를 주세요.`);
  } else {
    log(`서버 에러: ${err.message}`);
  }
  process.exit(1);
});

// ── 4. 바인딩하고 기다리기 (bind + listen) ──────────────────────────
// listen(port, host)는 Python의 bind()와 listen()을 한 번에 한다.
//
// host 값에 따라 "어느 문으로 온 손님을 받을지"가 정해진다.
//   127.0.0.1  루프백. 이 컴퓨터 안에서 온 연결만 받는다. 다른 기기에서는 Connection refused.
//   0.0.0.0    이 컴퓨터가 가진 모든 IPv4 주소. 와이파이 IP로 온 연결도 받는다.
//   (생략)     Node는 host를 안 주면 IPv6의 '::'(가능하면 IPv4까지 포함)에 바인딩한다.
//              즉 아무 설정 없이 server.listen(9000)만 하면 밖에서도 접속된다.
//              편하지만 의도치 않게 외부에 열리기 쉬워서 이 과제는 기본값을 127.0.0.1로 명시했다.
//
// 참고: Node(libuv)는 리눅스·macOS에서 서버 소켓에 SO_REUSEADDR를 기본으로 켠다.
//   그래서 서버를 끄자마자 다시 켜도, 지난 연결이 TIME_WAIT에 남아 있어서 생기는
//   'Address already in use'가 나지 않는다. (TIME_WAIT는 2주차 주영님 발표 주제)
server.listen(PORT, HOST, () => {
  const addr = server.address();
  log(`서버 시작  ${addr.address}:${addr.port} 에서 기다리는 중 (Ctrl+C 로 종료)`);
});

// ── 5. Ctrl+C로 깔끔하게 끝내기 ─────────────────────────────────────
// 새 연결은 더 받지 않고, 남은 연결은 끊고 종료한다.
process.on('SIGINT', () => {
  log('서버 종료');
  server.close();
  process.exit(0);
});
