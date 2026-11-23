#!/usr/bin/env bash
# 5주차 발표 라이브 데모 (장표 10·9·13·18·19). 서버는 ws-demo/server.js (라이브러리 없음).
#   bash demo.sh accept     # 장표 10: Key → Accept를 openssl로 직접 계산
#   bash demo.sh handshake  # 장표 9·11: curl로 101 받기, Upgrade 없으면 426, 버전 틀리면 426
#   bash demo.sh client     # 장표 13: 터미널 클라이언트가 글·바이너리·1,000바이트·close를 보냄 (서버 로그에 바이트)
#   bash demo.sh real       # 장표 19: 공개 에코 서버(echo.websocket.org)에 핸드셰이크 → via 헤더
#   bash demo.sh server     # 장표 18: 서버를 앞에 띄움. 브라우저로 http://localhost:8081 열고, 여기 글 치면 방송
#   bash demo.sh            # accept → handshake → client → real (서버는 뒤에서 잠깐 띄웠다 끔)
set -u
cd "$(dirname "$0")/ws-demo"
PORT=${PORT:-8081}
KEY='dGhlIHNhbXBsZSBub25jZQ=='   # RFC 6455 1.3의 예. 브라우저는 매번 무작위로 고른다
GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
pause() { [ -t 0 ] && read -r -p $'\n(엔터를 누르면 다음)' _; echo; }

STARTED=''
ensure_server() {
  if ! curl -s -o /dev/null "http://localhost:$PORT/"; then
    PORT=$PORT node server.js > /tmp/ws-demo-server.log 2>&1 &
    STARTED=$!
    for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.2; done
    echo "(서버를 뒤에서 띄웠다. 로그: /tmp/ws-demo-server.log)"
  fi
}
cleanup() { [ -n "$STARTED" ] && kill "$STARTED" 2>/dev/null; }
trap cleanup EXIT

accept() {
  echo "Key    = $KEY"
  echo "고정값 = $GUID"
  echo "Accept = base64(SHA-1(Key + 고정값))"
  printf '       = '
  printf '%s' "$KEY$GUID" | openssl sha1 -binary | base64
  echo "(RFC 6455 1.3절의 답: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=)"
}

handshake() {
  ensure_server
  echo "① 제대로 된 핸드셰이크 → 101"
  curl -s -i -N --max-time 1 http://localhost:$PORT/ws \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H "Sec-WebSocket-Key: $KEY" -H 'Sec-WebSocket-Version: 13' | head -5
  pause
  echo "② Upgrade 없이 같은 주소 → 보통 HTTP라 426"
  curl -s -i http://localhost:$PORT/ws | head -1
  echo "③ 버전을 8로 → 426 + 지원 버전 알림"
  curl -s -i --max-time 1 http://localhost:$PORT/ws \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H "Sec-WebSocket-Key: $KEY" -H 'Sec-WebSocket-Version: 8' | grep -iE '^(HTTP|sec-websocket-version)'
}

client() {
  ensure_server
  node client.mjs "ws://localhost:$PORT/ws"
  if [ -n "$STARTED" ]; then
    echo; echo "--- 서버가 찍은 프레임 (← 받은 것, → 보낸 것)"
    grep -E '^(←|→|   #)' /tmp/ws-demo-server.log | tail -12
  else
    echo "(프레임 바이트는 서버 터미널에서 보세요)"
  fi
}

real() {
  echo "공개 에코 서버에 같은 핸드셰이크 (HTTP/1.1로)"
  curl -s -i -N --http1.1 --max-time 3 https://echo.websocket.org/ \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H "Sec-WebSocket-Key: $KEY" -H 'Sec-WebSocket-Version: 13' \
    | grep -aiE '^(HTTP|upgrade|connection|sec-websocket-accept|via)' | tr -d '\r'
  echo "(via 줄 = 가운데 프록시가 Upgrade를 넘겨줬다)"
}

case "${1:-all}" in
  accept) accept ;;
  handshake) handshake ;;
  client) client ;;
  real) real ;;
  server) exec node server.js ;;
  *) accept; pause; handshake; pause; client; pause; real ;;
esac
