# ws-demo · 라이브러리 없이 만든 WebSocket 서버

5주차 발표 데모입니다. `node:http`의 `'upgrade'` 이벤트로 핸드셰이크를 받고, 그 뒤 TCP 소켓에서 프레임을 직접 읽고 씁니다. 오가는 프레임을 **16진수 바이트와 뜻**으로 터미널에 찍어서 "선 위에 실제로 무엇이 지나가나"를 보여 줍니다. 과제 E(WebSocket 알림판)의 출발점이기도 합니다.

## 한눈에 보는 결과 (11/23)

| 확인한 것 | 결과 |
| --- | --- |
| 핸드셰이크 | RFC 6455 예시 키 `dGhlIHNhbXBsZSBub25jZQ==` → `101` + `Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=` (RFC 답과 같음) |
| 거절 | Upgrade 없이 `/ws` → 426, 버전 8 → 426 + `sec-websocket-version: 13`, 남의 출처(`Origin: https://evil.example`) → 403 |
| 브라우저 → 서버 "Hi" | `81 82 33 bf 17 4c 7b d6`: text, MASK=1, 길이 2, 키 4바이트, 가면 쓴 내용 |
| 서버 → 브라우저 | `81 06 23 31 3a 20 48 69`: text, MASK=0, "#1: Hi" |
| 1,000바이트 글 | 길이 칸 126 + 2바이트(`81 fe 03 e8 …`, 가면 있음) |
| ping → pong | 서버가 보낸 시각이 그대로 돌아옴, 1~2ms |
| close | `88 85 …`(브라우저, 1000 "bye") → `88 05 03 e8 62 79 65`(서버) → TCP 닫힘 |
| 브라우저 (Ego Lite) | `Origin: http://localhost:8081`을 알아서 보냄, ping에 자동 pong, close 1000 `wasClean=true` |
| 공개 서버 | `echo.websocket.org`도 같은 Accept, `via: 1.1 fly.io, 1.1 fly.io`(프록시 두 대 통과) |
| 시험 | `npm test` 18개 통과 |

## 파일

| 파일 | 하는 일 |
| --- | --- |
| `lib/frame.js` | 프레임 읽고 쓰기, Accept 계산, close 본문, 발표용 16진수 출력 |
| `server.js` | 핸드셰이크 검사(400·403·404·405·426), 프레임 처리(text 방송, binary 되돌림, ping→pong, close, 조각 이어 붙이기), 하트비트, 서버 터미널 입력 방송 |
| `public/index.html` | 브라우저 데모 페이지: 상태(readyState), 글·바이너리 보내기, 닫기, 받은 것 목록 |
| `client.mjs` | 터미널 클라이언트(Node 22+의 내장 WebSocket): 글 → 바이너리 → 1,000바이트 → close |
| `test/` | 프레임 단위 시험 7개(RFC 예시 포함) + 서버 시험 11개(진짜 TCP로: 출처 검사, 크기 한도 포함) |
| `capture/` | `demo-output.txt`(`bash ../demo.sh` 출력), `server.log`(그때 서버 로그) |

## 돌려 보기

```bash
npm test                 # 시험 18개
node server.js           # http://localhost:8081 열기. 이 터미널에 글을 치면 모두에게 방송
node client.mjs          # 다른 터미널에서. 서버 로그에 바이트가 찍힌다
HEARTBEAT_MS=3000 node server.js   # ping을 3초마다 (기본 15초)
```

## 지킨 것 두 가지

- **출처(Origin) 검사**: WebSocket은 CORS를 받지 않아서, 막지 않으면 다른 사이트의 페이지가 사용자 쿠키를 싣고 붙을 수 있다(교차 사이트 WebSocket 하이재킹). 같은 호스트에서 연 페이지와 `ALLOWED_ORIGINS`에 적은 출처만 받고 나머지는 403. Origin이 없는 클라이언트(curl, Node)는 받는다. 브라우저가 아닌 것은 Origin을 마음대로 쓸 수 있으니, 실서비스에서는 이것과 별도로 로그인 확인이 필요하다(7주차).
- **크기 한도**: 머리에 적힌 길이가 1MB를 넘으면 내용을 기다리지 않고 close 1009. 조각난 메시지도 합이 1MB를 넘으면 1009. 길이만 크게 적고 천천히 보내 서버 메모리를 채우는 공격을 막는다.

## 예상과 달랐던 점

- **Node의 내장 WebSocket이 압축을 제안했다.** 핸드셰이크에 `Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits`가 실려 왔다. 서버가 응답에 이 헤더를 안 넣으니 압축 없이 주고받았다. 제안만으로는 안 켜진다.
- **curl이 끊고 나가도 서버가 연결을 붙들고 있었다.** curl이 close 프레임 없이 TCP만 닫자(FIN), 서버 소켓이 반쯤 열린 채 남아 다음 방송에서 `EPIPE`가 났다. `'end'` 이벤트에서 우리도 닫도록 고쳤고, 로그에 "close 프레임 없이 TCP가 끊김 (브라우저라면 1006)"을 찍는다. 1006이 어디서 생기는지 보여 주는 장면이 됐다.
- **WebSocket 메시지는 TCP 경계와 상관없다.** 시험에서 프레임을 한 바이트씩 잘라 넣어 보니, 길이 칸을 보고 다 올 때까지 기다리는 코드가 꼭 필요했다.
