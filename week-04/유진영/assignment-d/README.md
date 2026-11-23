# 과제 D. ETag 캐시와 프로토콜 비교 · 유진영

4주차 발표(캐시, ETag, 콘텐츠 협상)에서 말로 한 것을 직접 만들어 봅니다. 과제 C의 주문 API를 그대로 가져와(`week-03/유진영/assignment-c` 복사본) 두 가지를 더했습니다.

1. `GET /orders/:id`에 **ETag**(응답 본문의 지문)를 붙이고, 브라우저가 그 지문을 들고 다시 물으면(`If-None-Match`) **304**(바뀐 것 없음, 본문 없음)로 답합니다.
2. 자주 쓰는 사이트들이 실제로 **h1·h2·h3 중 무엇으로** 오는지, **Cache-Control**을 어떻게 주는지 표로 정리했습니다.

덤으로, 주문을 고치는 `PATCH /orders/:id`에 **If-Match**를 붙였습니다. "내가 본 판이 아직 최신일 때만 고쳐라"는 조건이고, 그사이 남이 고쳤으면 **412**로 막습니다. 4주차 노트 단원 3의 "If-Match → 412"를 직접 돌려 본 것입니다.

측정: 2026-11-23 (월) 17:53 KST, macOS, Docker, nginx 1.27, Node 24, Ego Lite(Chromium).

## 한눈에 보는 결과

| 체크 | 한 일 | 결과 |
| --- | --- | --- |
| ① 첫 GET | `curl /orders/1` | **200**, 본문 71바이트, `etag: "ff40bac14f087c63efe2"`, `cache-control: private, no-cache` |
| ② 다시 묻기 | 같은 ETag를 `If-None-Match`에 실어 GET | **304, 본문 0바이트**. 헤더(ETag, Cache-Control)만 왔다 |
| ③ nginx가 건드리나 | 받은 본문으로 ETag를 직접 계산해 비교 | **같음**. nginx는 ETag와 304를 그대로 넘겼다 (gzip이 꺼져 있을 때. 아래 "예상과 달랐던 점" 1) |
| ④ 고치기 | `PATCH` + `If-Match: 지금 ETag`, `{"qty":3}` | **200**, ETag가 `"ff40…"` → `"5a8c…"`로 바뀜 |
| ⑤ 옛 지문으로 묻기 | 옛 ETag로 `If-None-Match` GET | 304가 아니라 **200 + 새 본문**(qty 3) |
| ⑥ 늦게 고치기 | 옛 ETag로 `If-Match` PATCH, `{"qty":9}` | **412**. 주문은 qty 3 그대로. 남의 수정을 덮어쓰지 않았다 |
| ⑦ 프로토콜 표 | 사이트 4곳을 브라우저로 두 번씩 열어 Protocol 열 읽기 | 문서(HTML)는 4곳 모두 **h2**. GitHub의 정적 파일만 일부 **h3** (아래 표) |
| 시험 | `npm test` | **24개 통과** (과제 C 17개 + ETag 7개) |

## 파일 구성

| 파일 | 하는 일 |
| --- | --- |
| `server.js` | 앱 서버. 과제 C 그대로 + `GET /orders/:id`의 ETag·304, `PATCH /orders/:id`의 If-Match·412 |
| `lib/idempotency.js` | 멱등 키 저장소 (과제 C 그대로) |
| `nginx/nginx.conf` | 과제 C 그대로. nginx(:8080) → app(:3000) |
| `docker-compose.yml`, `Dockerfile` | 과제 C 그대로 |
| `reproduce.sh` | ①~⑥을 순서대로 재현하고 `capture/`에 저장, 끝나면 컨테이너를 내린다 |
| `test/server.test.js` | 통합 시험. 맨 아래 "과제 D" 7개가 새로 넣은 것 |
| `capture/` | `repro-output.txt`(curl 결과), `nginx.log`(접근 로그), `app.log`(앱 로그) |

## 돌려 보기

```bash
npm test           # 시험 24개 (docker 필요 없음)
bash reproduce.sh  # docker compose로 띄우고 ①~⑥ 재현, 약 10초. 끝나면 알아서 내린다
```

손으로 해 보려면:

```bash
docker compose up -d --build
curl -X POST localhost:8080/orders -H 'content-type: application/json' -H 'Idempotency-Key: k1' -d '{"item":"coffee","qty":1}'
curl -i localhost:8080/orders/1                                   # etag 값을 본다
curl -i localhost:8080/orders/1 -H 'If-None-Match: "<위 etag>"'   # 304
docker compose down
```

## 체크 ①~⑥ ETag와 304

### 어떻게 만들었나

```
GET /orders/1
  본문(JSON 글자) → SHA-256 → 앞 20자를 따옴표로 감쌈 → ETag "ff40bac14f087c63efe2"
  요청에 If-None-Match가 있나?
    없음                → 200 + 본문 + ETag
    있고 ETag가 같음     → 304 + ETag (본문 없음)
    있는데 다름          → 200 + 새 본문 + 새 ETag

PATCH /orders/1  (If-Match: "ff40…")
  지금 ETag와 같음 → 고치고 200 + 새 ETag
  다름             → 412, 고치지 않음
  헤더 없음        → 조건 없이 고침
```

- **누가 보내나**: `ETag`·`Cache-Control`은 서버가 **응답**에 싣습니다. `If-None-Match`·`If-Match`는 클라이언트가 **요청**에 싣습니다. 브라우저는 저장해 둔 ETag를 알아서 `If-None-Match`에 넣어 주고, curl은 우리가 손으로 넣습니다.
- **강한 ETag**: 본문이 한 글자라도 바뀌면 지문이 바뀝니다. 앞에 `W/`가 없어서 "바이트까지 똑같다"는 약속입니다.
- **`Cache-Control: private, no-cache`**: 주문은 한 사람의 데이터라 CDN 같은 공용 캐시는 저장하지 말고(`private`), 브라우저는 저장해도 되지만 쓸 때마다 서버에 물어보라(`no-cache`)는 뜻입니다. 그래서 브라우저는 매번 묻고, 안 바뀌었으면 304로 본문을 아낍니다.
- **두 비교법** (RFC 9110 13.1): `If-None-Match`는 **약한 비교**라 `W/`를 떼고 따옴표 안만 같으면 맞다고 봅니다. `If-Match`는 **강한 비교**라 `W/`가 붙은 지문은 절대 맞지 않습니다. 고칠 때는 "바이트까지 같은 판"이어야 안전하기 때문입니다. `*`는 둘 다 "자원이 있기만 하면 맞음"입니다. 시험 `If-None-Match: 쉼표 목록, *, W/ 약한 비교`와 `If-Match: *는 통과, W/는 강한 비교라 412`가 이것을 확인합니다.

### 결과 (`capture/repro-output.txt`에서)

```
== ② 처음 GET: 200 + 본문 + ETag (지문)
$ curl http://localhost:8080/orders/1
HTTP 200  본문 71바이트
  etag: "ff40bac14f087c63efe2"
  cache-control: private, no-cache
  본문: {"id":1,"item":"coffee","qty":1,"createdAt":"2026-11-23T08:53:20.776Z"}
  → 받은 본문으로 직접 계산한 ETag: "ff40bac14f087c63efe2"  (같음: nginx는 그대로 넘겼다)

== ③ 같은 ETag를 If-None-Match에 실어 다시 GET → 304, 본문 0바이트
$ curl http://localhost:8080/orders/1 -H If-None-Match: "ff40bac14f087c63efe2"
HTTP 304  본문 0바이트
  etag: "ff40bac14f087c63efe2"
  cache-control: private, no-cache

== ④ 주문 고치기: PATCH + If-Match(지금 ETag) → 200 + 새 ETag
HTTP 200  본문 110바이트
  etag: "5a8cabb86f64dbd34226"

== ⑤ 옛 ETag로 If-None-Match GET → 판이 바뀌었으니 304가 아니라 200 + 새 본문
HTTP 200  본문 110바이트
  etag: "5a8cabb86f64dbd34226"

== ⑥ 옛 ETag로 If-Match PATCH → 412, 덮어쓰지 않음
HTTP 412  본문 163바이트
  본문: {"code":"PRECONDITION_FAILED","message":"그사이 주문이 바뀌었습니다. 다시 조회한 뒤 고치세요",…}
```

nginx 접근 로그에서 `status=304 upstream_status=304`, `status=412 upstream_status=412`로, 두 코드 모두 **앱이 만들었고 nginx는 전달만 했다**는 것이 보입니다(3주차에 쓴 로그 형식).

```
"GET /orders/1 HTTP/1.1"   status=304 upstream_status=304 …
"PATCH /orders/1 HTTP/1.1" status=412 upstream_status=412 …
```

## 체크 ⑦ 사이트별 Protocol과 Cache-Control

### 어떻게 쟀나

- DevTools Network 탭의 **Protocol 열**은 페이지 안에서 `performance.getEntriesByType('navigation' | 'resource')[i].nextHopProtocol`로도 읽을 수 있습니다. 같은 값입니다.
- 브라우저(Ego Lite, Chromium)로 사이트마다 **두 번** 열었습니다(처음 열기 + 새로고침). h3는 보통 첫 응답의 `Alt-Svc` 헤더("h3도 돼요")를 보고 **다음 연결부터** 쓰기 때문입니다.
- 교차 확인으로 `curl -sI --http2`의 `http_version`, `cache-control`, `alt-svc`도 봤습니다. 이 맥의 curl(8.7.1)은 HTTP/3를 지원하지 않아서 h3는 브라우저 값만 믿었습니다.
- 사이트는 4주차 장표 18과 같은 곳입니다. jQuery는 첫 화면이 `releases.jquery.com`으로 넘어가서, 실제로 쓰는 파일 `jquery-3.7.1.min.js`를 재었습니다.

### 결과 (2026-11-23 17:54 KST)

| 사이트 | 문서 Protocol (1회 → 2회) | 같은 사이트 정적 파일 Protocol | 문서의 Cache-Control | 정적 파일의 Cache-Control |
| --- | --- | --- | --- | --- |
| 우리 서비스 | ( ) | ( ) | ( ) | ( ) |
| naver.com | h2 → h2 | 읽을 수 없음 (`s.pstatic.net` 등 다른 출처, 아래 2) | `no-cache, no-store, must-revalidate` | `max-age=31536000` (1년, `s.pstatic.net` 이미지) |
| github.com | h2 → h2 | `github.githubassets.com`: **h2 74개 + h3 14개 → h2 74 + h3 16** | `max-age=0, private, must-revalidate` + 약한 ETag `W/"d0ac…"` | (헤더 없음) + `alt-svc: h3=":443"` |
| developer.mozilla.org | h2 → h2 | 같은 주소 파일 69개 모두 h2 | `public, max-age=3600` + 강한 ETag | (같은 주소) |
| code.jquery.com | h2 → h2 (`jquery-3.7.1.min.js`) | (파일 자체가 문서) | `public, max-age=31536000, stale-while-revalidate=604800` | (같음) |

"우리 서비스" 칸은 주소를 넣어 아래 한 줄로 채웁니다. 브라우저 DevTools에서 Protocol 열을 켜서(열 이름 위 오른쪽 클릭 → Protocol) 같이 봅니다.

```bash
curl -sI --http2 https://<우리 서비스 주소>/ -o /dev/null -w '%{http_version}\n' -D - | grep -iE '^(cache-control|alt-svc|etag):'
```

### 읽는 법

- **HTML은 짧게, 정적 파일은 길게**: 네이버·GitHub는 HTML을 아예 저장하지 않거나(`no-store`) 매번 묻게(`max-age=0, must-revalidate`) 하고, 이미지·라이브러리 파일은 1년(`31536000`초)을 줍니다. 4주차 노트 단원 7 "파일 이름에 해시를 넣고 길게"와 같은 그림입니다.
- **GitHub의 HTML에 `private`**: 로그인한 사람마다 화면이 달라서 CDN이 저장하면 안 됩니다. 우리 주문 API에 `private`을 붙인 이유와 같습니다.
- **h3는 "사이트 전체가 h3"가 아니다**: GitHub도 HTML은 h2였고, 정적 파일 서버 하나에서도 h2와 h3가 섞였습니다(아래 3).

## 예상과 달랐던 점

1. **nginx에서 gzip을 켜면 강한 ETag가 약한 ETag로 바뀐다.** 기본 설정(gzip 꺼짐)에서는 ETag가 그대로 왔습니다. 따로 `gzip on; gzip_types application/json;`을 켜고 `Accept-Encoding: gzip`으로 받아 보니, 앱이 보낸 `"daf38dd5…"`가 `W/"daf38dd5…"`로 바뀌어 왔습니다. nginx가 본문을 압축해서 바이트가 달라졌으니 "바이트까지 같다"는 강한 약속을 지킬 수 없어 `W/`를 붙인 것입니다. 그래도 그 지문으로 다시 물으면 304가 왔습니다. `If-None-Match`는 약한 비교라 `W/`를 떼고 보기 때문입니다. 반대로 그 `W/` 지문을 `If-Match`에 넣어 PATCH하면 412가 납니다(강한 비교). **gzip을 켠 서버에서 If-Match로 낙관적 잠금을 쓰면 늘 412가 날 수 있다**는 함정입니다. 이 확인은 임시 설정으로만 했고, 저장소의 `nginx.conf`는 gzip을 켜지 않았습니다.
2. **다른 출처 파일은 페이지 안에서 Protocol을 읽을 수 없었다.** 네이버의 이미지·스크립트는 대부분 `s.pstatic.net` 같은 다른 주소에서 오는데, 116개 모두 `nextHopProtocol`이 빈칸이었습니다. 다른 출처가 `Timing-Allow-Origin` 헤더를 주지 않으면 브라우저가 시간·프로토콜 정보를 페이지 스크립트에 감추기 때문입니다. GitHub 정적 파일 서버는 `timing-allow-origin: *`을 줘서 읽혔습니다. DevTools 화면에서는 둘 다 보입니다. **스크립트로 재면 빈칸이 "모름"이지 "h1"이 아닙니다.**
3. **h3는 섞여서 나왔다.** GitHub 정적 파일 서버(`github.githubassets.com`)는 `alt-svc: h3=":443"`으로 h3를 광고하는데, 두 번째 열기에서도 h3는 16개뿐이고 74개는 h2였습니다. Chromium은 h3(UDP) 연결을 시도하는 동안 h2(TCP) 연결도 함께 열고 준비된 쪽으로 보내는 것으로 알려져 있어, 같은 서버라도 요청마다 다를 수 있습니다(이번 측정으로 원인까지 확인하지는 않았습니다). 첫 열기부터 h3가 나온 것은 이 브라우저가 전에 GitHub에 가 본 적이 있어 `Alt-Svc`를 기억하고 있었기 때문으로 보입니다.
4. **PATCH로 같은 값을 넣어도 ETag가 바뀐다.** 지문을 "본문 전체"로 만들었는데, PATCH마다 `updatedAt` 시각이 새로 찍혀서 qty를 3에서 3으로 "고쳐도" 본문이 달라지고 ETag도 바뀝니다. 브라우저 입장에서는 "바뀌었다"가 되어 304 대신 200을 받습니다. 지문에 무엇을 넣을지(본문 전체, 아니면 버전 번호)가 곧 "무엇을 바뀐 것으로 칠지"를 정합니다. 실서비스라면 DB의 버전 칼럼을 ETag로 쓰는 편이 계산도 싸고 뜻도 분명합니다.
5. **304는 본문이 없는데 헤더는 다시 실어야 한다.** "바뀐 것 없음"이니 아무것도 안 보내면 될 것 같지만, RFC 9110 15.4.5는 200이었으면 보냈을 `ETag`·`Cache-Control` 등을 304에도 보내라고 합니다(MUST). 그래서 304에도 두 헤더를 넣었습니다. 브라우저가 저장해 둔 사본의 유통기한을 이 헤더로 새로 고치기 때문입니다.

## 다음 과제(E)로

과제 E(실시간 알림판)는 5주차 발표(WebSocket 핸드셰이크와 프레임)와 이어집니다. 5주차 자료는 `week-05/유진영/`에 둡니다.
