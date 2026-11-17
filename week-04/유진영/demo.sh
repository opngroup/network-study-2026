#!/usr/bin/env bash
# 4주차 발표 라이브 데모 (장표 12·16·18). ETag 복사·붙여넣기 없이 한 번에 돈다.
#   bash demo.sh        # 셋 다
#   bash demo.sh etag   # 장표 12만: 200 → 같은 지문으로 다시 → 304
#   bash demo.sh lang   # 장표 16만: Accept-Language만 바꿔 MDN에 요청
#   bash demo.sh sites  # 장표 18만: 사이트별 Cache-Control
set -u
U=https://developer.mozilla.org/en-US/
pause() { [ -t 0 ] && read -r -p $'\n(엔터를 누르면 다음)' _; echo; }

etag() {
  echo "① 처음 받기"
  curl -s -o /dev/null -D - -w 'body=%{size_download}B  time=%{time_total}s\n' "$U" \
    | grep -iE '^(HTTP|etag|cache-control|age)|body'
  E=$(curl -s -o /dev/null -D - "$U" | awk 'tolower($1)=="etag:"{print $2}' | tr -d '\r')
  pause
  echo "② 받은 지문을 들고 다시 묻기: If-None-Match: $E"
  curl -s -o /dev/null -D - -w 'body=%{size_download}B  time=%{time_total}s\n' \
    -H "If-None-Match: $E" "$U" | grep -iE '^(HTTP|etag)|body'
  pause
  echo "③ 같은 문서를 gzip으로 받으면"
  curl -s -o /dev/null -w 'body=%{size_download}B\n' -H 'Accept-Encoding: gzip' "$U"
}

lang() {
  for l in ko ja en; do
    printf 'Accept-Language: %-3s → ' "$l"
    curl -s -o /dev/null -D - -H "Accept-Language: $l" https://developer.mozilla.org/ \
      | grep -iE '^(HTTP|location|vary)' | tr -d '\r' | tr '\n' ' '
    echo
  done
}

sites() {
  for s in https://www.naver.com/ https://github.com/ \
           https://developer.mozilla.org/en-US/ https://code.jquery.com/jquery-3.7.1.min.js; do
    echo "--- $s"
    curl -s -o /dev/null -D - "$s" | grep -iE '^(cache-control|etag)' | tr -d '\r'
  done
}

case "${1:-all}" in
  etag) etag ;;
  lang) lang ;;
  sites) sites ;;
  *) etag; pause; lang; pause; sites ;;
esac
