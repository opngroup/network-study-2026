#!/usr/bin/env bash
# 내 컴퓨터가 쓴 출발지(사설)와 서버가 본 출발지(공인)를 나란히 찍는다.
# 둘이 다르면 그 사이에서 NAT(IP) · NAPT(포트)가 일어난 것이다.
# -4: IPv6 로 나가면 NAT 를 거치지 않아 비교가 안 되므로 IPv4 로 고정한다.

printf '%-4s %-24s %s\n' '#' '내가 쓴 출발지 (사설)' '서버가 본 출발지 (공인)'
for i in 1 2 3; do
  out=$(curl -s -4 -w '\n%{local_ip}:%{local_port}' https://ifconfig.me/all.json)
  mine=$(printf '%s' "$out" | tail -n 1)
  ip=$(printf '%s' "$out" | sed -n 's/.*"ip_addr": *"\([^"]*\)".*/\1/p')
  port=$(printf '%s' "$out" | sed -n 's/.*"port": *"\{0,1\}\([0-9]*\)"\{0,1\}.*/\1/p')
  printf '%-4s %-24s %s\n' "$i" "$mine" "$ip:$port"
done
