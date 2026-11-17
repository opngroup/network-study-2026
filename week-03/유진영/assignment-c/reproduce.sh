#!/usr/bin/env bash
# 과제 C 재현 스크립트: 멱등 POST, 500, 504, 504 뒤 재시도, 502(앱 꺼짐), 502(바인딩 실수)
# 실행: bash reproduce.sh   (docker compose가 필요하다. 결과는 capture/ 에 저장)
set -euo pipefail
cd "$(dirname "$0")"

BASE=http://localhost:8080
OUT=capture/repro-output.txt
mkdir -p capture
: > "$OUT"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; printf '\n== %s\n' "$*" >> "$OUT"; }
run()  { printf '$ %s\n' "$*" | tee -a "$OUT"; eval "$@" 2>&1 | tee -a "$OUT"; echo | tee -a "$OUT" >/dev/null; }
# 상태 줄과 본문만 보여 주는 curl
req()  { curl -s -o /tmp/assignment-c-body -w 'HTTP %{http_code}  (%{time_total}s)\n' "$@"; head -c 300 /tmp/assignment-c-body; echo; }
order() { req -X POST "$BASE/orders$2" -H 'content-type: application/json' -H "Idempotency-Key: $1" -d '{"item":"coffee","qty":1}' -D - | grep -iE '^(HTTP|idempotent-replayed|location)' || true; }

wait_healthy() {
  for _ in $(seq 1 30); do
    curl -sf "$BASE/health" >/dev/null && return 0
    sleep 0.5
  done
  echo "앱이 뜨지 않았다" >&2; return 1
}

say "준비: 깨끗하게 다시 띄우기"
docker compose down -t 1 >/dev/null 2>&1 || true
docker compose up -d --build >/dev/null 2>&1
wait_healthy

say "① 멱등: 같은 키로 POST 두 번 → 주문 1건"
run "order key-001 ''"
run "order key-001 ''"
run "req $BASE/orders"

say "② 500: 핸들러가 예외를 던진다 (앱이 만든 응답)"
run "req $BASE/boom"

say "③ 504: 앱이 4초 걸리는데 nginx는 2초만 기다린다 (nginx가 만든 응답)"
run "req '$BASE/slow?ms=4000'"

say "④ 504의 함정: 느린 POST가 504로 끝나도 앱은 주문을 만들었다 → 같은 키로 재시도"
run "order key-002 '?delayMs=4000'"
echo "(앱이 뒤에서 끝낼 때까지 3초 기다림)" | tee -a "$OUT"; sleep 3
run "order key-002 ''"
run "req $BASE/orders"

say "⑤ 502: 앱이 응답 도중 연결을 끊는다 (처리 중 죽은 상황)"
run "req $BASE/crash"
# ⑦에서 앱 컨테이너를 새로 만들면 로그가 사라지므로 여기서 앱 로그를 저장한다
docker compose logs --no-color --no-log-prefix app > capture/app.log 2>&1 || true

say "⑥ 앱 컨테이너를 통째로 끈다 → 502를 기대했지만…"
docker compose stop -t 1 app >/dev/null 2>&1
run "req $BASE/health"
docker compose start app >/dev/null 2>&1
wait_healthy

say "⑦ 502: 앱을 127.0.0.1에만 바인딩한다 (1주차 바인딩 실수)"
APP_HOST=127.0.0.1 docker compose up -d app >/dev/null 2>&1
sleep 1.5
run "req $BASE/health"
docker compose up -d app >/dev/null 2>&1   # 0.0.0.0으로 되돌리기
wait_healthy

say "nginx 로그 (접근 로그 + 에러 로그)"
docker compose logs --no-color --no-log-prefix nginx 2>&1 \
  | grep -vE 'listen-on-ipv6|docker-entrypoint|/docker-entrypoint|Configuration complete|start worker|using the "epoll"|nginx/1\.|built by|OS: |getrlimit|signal process started|notice' \
  > capture/nginx.log || true
cat capture/nginx.log | tee -a "$OUT"

echo; echo "결과 저장: capture/repro-output.txt, capture/nginx.log, capture/app.log"
