# 과제 C. 멱등 API와 502·504 재현 · 유진영

주문 API를 nginx 뒤에 두고 두 가지를 확인합니다. 첫째, 같은 `Idempotency-Key`로 두 번 와도 주문이 한 번만 생기는지. 둘째, 500·502·504가 각각 어떤 상황에서 누가 만드는지. 앱은 과제 A·B처럼 Node.js 표준 모듈만 씁니다(`node:http`).

## 한눈에 보는 결과

| 체크 | 한 일 | 결과 |
| --- | --- | --- |
| ① 멱등 | 같은 키로 `POST /orders` 두 번 | 둘 다 201, 두 번째는 `Idempotent-Replayed: true`. 주문은 **1건** |
| ② 500 | 핸들러가 예외를 던짐 (`/boom`) | 500. 앱이 만든 응답. nginx는 그대로 전달만 했다 |
| ③ 504 | 앱이 4초 걸리는데 nginx는 2초만 기다림 (`/slow?ms=4000`) | 정확히 2.00초 뒤 504. 앱은 뒤에서 4초를 다 채우고 응답을 보냈다(아무도 안 받음) |
| ④ 504 뒤 재시도 | 느린 POST가 504 → 같은 키로 다시 보냄 | 재시도는 201 + `Idempotent-Replayed`. 주문은 **1건**. 3주차 "504의 함정"을 키가 막아 줬다 |
| ⑤ 502 | 앱이 응답 도중 연결을 끊음 (`/crash`) | 502, `upstream prematurely closed connection`. **nginx가 스스로 한 번 더 시도**했다 |
| ⑥ 앱 컨테이너 끄기 | `docker compose stop app` | **502가 아니라 504**. 2초 동안 연결이 안 돼서 시간 초과. 아래 "예상과 달랐던 점" |
| ⑦ 바인딩 실수 | 앱을 `127.0.0.1`에만 바인딩 | 즉시 502, `connect() failed (111: Connection refused)`. 3주차 장표 12 그대로 |

## 파일 구성

| 파일 | 하는 일 |
| --- | --- |
| `server.js` | 앱 서버. `POST /orders`, `GET /orders`, `GET /orders/:id`, `/slow`, `/boom`, `/crash`, `/health` |
| `lib/idempotency.js` | 멱등 키 저장소. 키별로 "처리 중 / 끝남(응답 저장)"을 기억한다 |
| `nginx/nginx.conf` | `proxy_read_timeout 2s`, upstream keepalive, 로그에 `upstream_status`와 `$request_id` |
| `docker-compose.yml`, `Dockerfile` | nginx(:8080) → app(:3000). 앱 포트는 바깥에 열지 않는다 |
| `reproduce.sh` | ①~⑦을 순서대로 재현하고 `capture/`에 저장 |
| `test/` | 단위 시험 7개(멱등 저장소) + 통합 시험 10개(진짜 HTTP로 띄워서). `npm test` |
| `capture/` | `repro-output.txt`(curl 결과), `nginx.log`(접근·에러 로그), `app.log`(앱 로그) |

## 돌려 보기

```bash
npm test           # 시험 17개 (docker 필요 없음)
bash reproduce.sh  # docker compose로 띄우고 ①~⑦ 재현, 약 25초
docker compose down
```

손으로 하나씩 해 보려면 `docker compose up -d --build` 뒤에 아래처럼 보냅니다.

```bash
curl -i -X POST localhost:8080/orders -H 'content-type: application/json' \
  -H 'Idempotency-Key: my-key-1' -d '{"item":"coffee","qty":1}'
```

## 체크 ① 멱등 POST: 같은 키면 처음 응답을 다시 준다

### 어떻게 만들었나

```
요청 → 키가 있나? ─ 없음 → 400 IDEMPOTENCY_KEY_REQUIRED
         │
         └ 있음 → 저장소에 물어본다 (begin)
              new        처음 보는 키 → 주문 생성 → 응답을 키에 저장(complete) → 201
              replay     이미 끝난 키 → 저장된 응답 그대로 + Idempotent-Replayed: true
              in_flight  같은 키가 아직 처리 중 → 409 REQUEST_IN_PROGRESS (잠시 뒤 다시)
              mismatch   같은 키인데 본문이 다름 → 422 IDEMPOTENCY_KEY_REUSED
```

- **본문 지문(fingerprint)**: 키만 보면 "같은 키에 다른 주문"을 실수로 보냈을 때 엉뚱한 응답을 돌려주게 됩니다. 그래서 본문의 SHA-256을 같이 저장하고, 다르면 422로 막습니다.
- **처리 중(in_flight)**: 첫 요청이 아직 안 끝났는데 같은 키가 또 오면 주문을 두 번 만들 수 있습니다. 그래서 "처리 중" 표시를 먼저 해 두고 409로 돌려보냅니다.
- **실패하면 키를 지운다(abort)**: 처리 중 예외가 나면 키를 지워서, 클라이언트가 같은 키로 다시 시도할 수 있게 합니다.
- **24시간 보관**: Stripe와 같은 기준입니다. 저장소는 메모리라 서버를 재시작하면 잊습니다. 실서비스라면 Redis(`SET key value NX EX 86400`)나 DB 유니크 제약으로 바꿉니다.

### 결과

```
$ (같은 키 key-001로 두 번)
HTTP/1.1 201 Created
location: /orders/1
HTTP/1.1 201 Created
idempotent-replayed: true

$ curl localhost:8080/orders
[{"id":1,"item":"coffee","qty":1,"createdAt":"2026-11-12T02:25:44.…Z"}]   ← 1건
```

앱 로그(`capture/app.log`)에도 두 번째는 "처음 응답을 다시 보냄 (새 주문 없음)"으로 남습니다.

## 체크 ② ~ ⑦ 500·502·504 재현

nginx 접근 로그에 `status`(nginx가 브라우저에 준 코드)와 `upstream_status`(앱에게서 받은 결과)를 나란히 찍었습니다. 둘을 같이 보면 "누가 만든 코드인가"가 바로 보입니다.

| | 브라우저가 받은 것 | 걸린 시간 | nginx error.log | 누가 만들었나 |
| --- | --- | --- | --- | --- |
| ② `/boom` | 500 + JSON(`code`, `requestId`) | 0.000초 | (없음) | 앱 |
| ③ `/slow?ms=4000` | 504 + nginx 기본 HTML | 2.003초 | `upstream timed out (110) while reading response header` | nginx |
| ⑤ `/crash` | 502 + nginx 기본 HTML | 0.002초 | `upstream prematurely closed connection` ×2 | nginx |
| ⑥ 앱 컨테이너 정지 | **504** + nginx 기본 HTML | 2.005초 | `upstream timed out (110) while connecting to upstream` | nginx |
| ⑦ `127.0.0.1` 바인딩 | 502 + nginx 기본 HTML | 0.001초 | `connect() failed (111: Connection refused)` | nginx |

- **본문으로도 구분됩니다.** 500은 우리가 정한 JSON이고, 502·504는 `<center>nginx/1.27.5</center>`가 박힌 nginx 기본 HTML입니다. 프론트가 `res.json()`을 부르다 터진다면 502·504일 가능성이 큽니다.
- **requestId로 세 로그가 묶입니다.** ②의 응답 본문 `requestId`, nginx 접근 로그의 `req_id`, 앱 로그의 `[error] requestId=` 셋 다 `2ab93a59…`로 같습니다. nginx가 `X-Request-Id: $request_id`를 붙여 앱에 넘기고, 앱이 그 값을 쓰기 때문입니다.

### ④ 504의 함정을 멱등 키가 막는다

3주차 발표에서 "504는 앱이 실패한 게 아니라 nginx가 답을 못 들은 것이라, 결제가 이미 됐을 수도 있다"고 했습니다. 그걸 그대로 재현했습니다.

```
POST /orders?delayMs=4000  Idempotency-Key: key-002   → 504 (2.0초)   ← 손님은 실패로 안다
   (그사이 앱 로그) [orders] key=key-002 → 주문 #2 생성                  ← 앱은 주문을 만들었다
POST /orders               Idempotency-Key: key-002   → 201, Idempotent-Replayed: true
GET  /orders  → 주문 #1, #2 두 건뿐                                        ← 재시도로 #3이 생기지 않았다
```

키 없이 재시도했다면 주문 #3이 생겨 커피가 두 잔 나갔을 겁니다. 그리고 nginx 로그를 보면 이 POST는 nginx가 스스로 재시도하지 **않았습니다**(⑤와 비교).

## 예상과 달랐던 점

1. **앱 컨테이너를 끄면 502가 아니라 504가 났다.** 과제 설명은 "앱 서버를 끄면 502"였습니다. 그런데 `docker compose stop app`을 하면 2초 기다린 뒤 504가 나왔고, 에러 로그는 `while connecting to upstream`이었습니다.
   - 이유: 컨테이너를 멈추면 그 컨테이너의 IP(172.29.0.2)가 네트워크에서 **사라집니다**. nginx가 그 주소로 SYN을 보내도 "거기 없어요"(RST)라고 대답해 줄 운영체제조차 없어서, SYN이 허공에 떨어지고 `proxy_connect_timeout`(2초)이 지나 504가 됩니다.
   - 반대로 ⑦처럼 **컨테이너(운영체제)는 살아 있는데 그 포트를 듣는 프로세스가 없으면**, 운영체제가 즉시 RST로 거절해서 0.001초 만에 502가 납니다. 1주차 데모에서 서버를 끄고 `nc`로 붙었을 때 본 "Connection refused"가 바로 이것입니다.
   - 정리: **"앱이 죽었다 = 502"가 아니라, "거절당했다 = 502, 대답이 없다 = 504"** 입니다. 서버가 통째로 꺼지거나 방화벽이 패킷을 버리면 504로 보일 수 있습니다. 3주차 장표 11 표에 "connect 단계의 504"를 한 줄 더하면 좋겠습니다.
2. **nginx가 `/crash`를 두 번 보냈다.** 접근 로그에 `upstream_status=502, 502`, 앱 로그에 `[crash]`가 두 번 찍혔습니다. 서버가 하나뿐인데도 재시도한 이유는 upstream keepalive 때문입니다. nginx는 재사용하던 연결이 끊기면 "연결이 마침 닫혔나 보다" 하고 새 연결로 한 번 더 보냅니다. GET이라 다시 보내도 된다고 보는 것이고, ④의 POST는 다시 보내지 않았습니다.
   - 확인: `nginx.conf`에서 `keepalive 8;`을 빼고 `/crash`를 두 번 보내 봤더니, 요청마다 `upstream_status=502` 하나씩, 앱 로그 `[crash]`도 요청 수만큼만 찍혔습니다. 재사용 연결이 없으면 재시도도 없습니다. 3주차에 "nginx도 멱등 요청만 재시도한다"고 말한 것을 직접 봤습니다.
3. **504가 나도 앱은 일을 멈추지 않는다.** ③에서 nginx가 2초에 포기했지만 앱 로그에는 "4000ms 끝, 응답 보냄"이 찍혔습니다. 받을 사람이 없는 응답을 만드느라 2초를 더 쓴 겁니다. `proxy_read_timeout`만 줄이면 사용자는 빨리 실패를 보지만 서버 부하는 그대로입니다. 앱 쪽에도 요청 시간 제한(또는 `req.on('close')`로 손님이 떠났는지 확인)이 필요합니다.
4. **멱등 키는 "키"만으로는 부족했다.** 처음에는 키 → 응답만 저장하려 했는데, 시험을 쓰다 보니 ⓐ 첫 요청이 아직 처리 중일 때 같은 키가 오는 경우, ⓑ 같은 키에 다른 본문이 오는 경우가 걸렸습니다. 그래서 "처리 중" 상태와 본문 지문을 추가했습니다.

## 다음 과제(D)로

과제 D는 이 서버의 `GET /orders/:id`에 ETag를 붙이는 것부터 시작합니다. 4주차 발표 자료는 [`week-04/유진영/`](../../../week-04/유진영/)에 있습니다.
