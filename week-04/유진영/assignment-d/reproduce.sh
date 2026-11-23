#!/usr/bin/env bash
# 과제 D 재현 스크립트: ETag → If-None-Match → 304, PATCH 뒤 ETag 바뀜, If-Match 412
# 실행: bash reproduce.sh   (docker compose가 필요하다. 결과는 capture/ 에 저장)
# 모든 요청은 nginx(:8080)를 거친다. nginx가 ETag와 304를 건드리지 않고 넘기는지도 같이 본다
set -euo pipefail
cd "$(dirname "$0")"

BASE=http://localhost:8080
OUT=capture/repro-output.txt
BODY=$(mktemp)
HDRS=$(mktemp)
trap 'rm -f "$BODY" "$HDRS"' EXIT
mkdir -p capture
: > "$OUT"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; printf '\n== %s\n' "$*" >> "$OUT"; }
log() { printf '%s\n' "$*" | tee -a "$OUT"; }
# 상태 줄, 고른 헤더, 본문 크기, 본문 앞부분을 보여 주는 curl. 마지막 응답 헤더는 $HDRS에 남는다
req() {
  log "\$ curl $*"; : > "$BODY"
  curl -s -D "$HDRS" -o "$BODY" -w 'HTTP %{http_code}  본문 %{size_download}바이트\n' "$@" | tee -a "$OUT"
  grep -iE '^(etag|cache-control|content-length|content-encoding):' "$HDRS" | tr -d '\r' | sed 's/^/  /' | tee -a "$OUT" || true
  if [ -s "$BODY" ]; then printf '  본문: %s\n' "$(head -c 200 "$BODY")" | tee -a "$OUT"; fi
}
etag_now() { grep -i '^etag:' "$HDRS" | tr -d '\r' | sed 's/^[^:]*: //'; }

wait_healthy() {
  for _ in $(seq 1 30); do
    curl -sf "$BASE/health" >/dev/null && return 0
    sleep 0.5
  done
  echo "앱이 뜨지 않았다" >&2; return 1
}

log "실행: $(date '+%Y-%m-%d %H:%M %Z')"

say "준비: 깨끗하게 다시 띄우기 (nginx :8080 → app :3000)"
docker compose down -t 1 >/dev/null 2>&1 || true
docker compose up -d --build >/dev/null 2>&1
wait_healthy

say "① 주문 하나 만들기"
req -X POST "$BASE/orders" -H 'content-type: application/json' -H 'Idempotency-Key: d-001' -d '{"item":"coffee","qty":1}'

say "② 처음 GET: 200 + 본문 + ETag (지문)"
req "$BASE/orders/1"
ETAG1=$(etag_now)
log "  → 받은 ETag: $ETAG1"
# nginx가 본문이나 ETag를 바꾸지 않았는지: 받은 본문의 SHA-256 앞 20자가 ETag와 같아야 한다
CALC="\"$(shasum -a 256 "$BODY" | cut -c1-20)\""
log "  → 받은 본문으로 직접 계산한 ETag: $CALC  ($( [ "$CALC" = "$ETAG1" ] && echo '같음: nginx는 그대로 넘겼다' || echo '다름!'))"

say "③ 같은 ETag를 If-None-Match에 실어 다시 GET → 304, 본문 0바이트"
req "$BASE/orders/1" -H "If-None-Match: $ETAG1"

say "③-b gzip을 달라고 해도(Accept-Encoding) ETag가 그대로인지 (nginx 기본 설정은 gzip off)"
req "$BASE/orders/1" -H 'Accept-Encoding: gzip'

say "④ 주문 고치기: PATCH + If-Match(지금 ETag) → 200 + 새 ETag"
req -X PATCH "$BASE/orders/1" -H 'content-type: application/json' -H "If-Match: $ETAG1" -d '{"qty":3}'
ETAG2=$(etag_now)
log "  → ETag가 $ETAG1 → $ETAG2 로 바뀌었다"

say "⑤ 옛 ETag로 If-None-Match GET → 판이 바뀌었으니 304가 아니라 200 + 새 본문"
req "$BASE/orders/1" -H "If-None-Match: $ETAG1"

say "⑥ 옛 ETag로 If-Match PATCH (남이 먼저 고친 뒤 내가 고치려는 상황) → 412, 덮어쓰지 않음"
req -X PATCH "$BASE/orders/1" -H 'content-type: application/json' -H "If-Match: $ETAG1" -d '{"qty":9}'
req "$BASE/orders/1"

say "nginx 접근 로그 (status = nginx가 준 코드, upstream_status = 앱이 준 코드)"
docker compose logs --no-color --no-log-prefix nginx 2>&1 | grep -E 'status=' > capture/nginx.log || true
tee -a "$OUT" < capture/nginx.log
docker compose logs --no-color --no-log-prefix app > capture/app.log 2>&1 || true

docker compose down -t 1 >/dev/null 2>&1
echo; echo "결과 저장: capture/repro-output.txt, capture/nginx.log, capture/app.log (컨테이너는 내렸다)"
