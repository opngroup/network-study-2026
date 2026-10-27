#!/bin/zsh
# 9000번 연결의 TCP 상태를 1초마다 다시 찍는다. 끝내려면 Ctrl+C
while true; do
  clear
  echo "[감시] 9000번 연결 상태 — 1초마다 갱신 (끝내려면 Ctrl+C)   $(date +%T)"
  echo
  printf "%-8s %-22s %-22s %s\n" "누구" "내 주소" "상대 주소" "상태"
  netstat -an -p tcp | awk '$4 ~ /\.9000$/ || $5 ~ /\.9000$/' | while read p rq sq l f st; do
    if [[ $st == LISTEN ]]; then who="서버대기"; elif [[ $l == *.9000 ]]; then who="서버"; else who="클라이언트"; fi
    printf "%-8s %-22s %-22s %s\n" "$who" "$l" "$f" "$st"
  done
  sleep 1
done
