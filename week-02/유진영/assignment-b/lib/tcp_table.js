/**
 * 운영체제의 TCP 연결 표를 읽는 도우미.
 * ------------------------------------------------------------------
 * `netstat`이 보여 주는 "어떤 포트 쌍이 어떤 상태인지" 목록을 코드에서 쓰기 좋게 돌려준다.
 *   - 리눅스:  /proc/net/tcp, /proc/net/tcp6 파일을 직접 읽는다 (netstat·ss가 읽는 바로 그 파일)
 *   - macOS:   `netstat -anp tcp` 출력을 읽는다
 *   - Windows: `netstat -ano -p tcp` 출력을 읽는다
 *
 * 돌려주는 값: [{ localPort, remotePort, state }]
 *   state 예: 'ESTABLISHED', 'FIN_WAIT_2', 'CLOSE_WAIT', 'TIME_WAIT', 'LISTEN'
 */

'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// 리눅스 커널이 /proc/net/tcp 에 적는 상태 번호 → 이름 (include/net/tcp_states.h)
const LINUX_STATES = {
  '01': 'ESTABLISHED', '02': 'SYN_SENT', '03': 'SYN_RECV', '04': 'FIN_WAIT_1',
  '05': 'FIN_WAIT_2', '06': 'TIME_WAIT', '07': 'CLOSE', '08': 'CLOSE_WAIT',
  '09': 'LAST_ACK', '0A': 'LISTEN', '0B': 'CLOSING',
};

function readLinux() {
  const rows = [];
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.trim().split('\n').slice(1)) {
      // 예: "0: 0100007F:2328 0100007F:D696 06 ..."  → 주소:포트(16진수), 상태 번호
      const [, local, remote, st] = line.trim().split(/\s+/);
      rows.push({
        localPort: parseInt(local.split(':')[1], 16),
        remotePort: parseInt(remote.split(':')[1], 16),
        state: LINUX_STATES[st] ?? st,
      });
    }
  }
  return rows;
}

function readNetstat(args, sep) {
  const out = execFileSync('netstat', args, { encoding: 'utf8' });
  const rows = [];
  for (const line of out.split('\n')) {
    const cols = line.trim().split(/\s+/);
    // macOS: tcp4 0 0 127.0.0.1.60546 127.0.0.1.9000 TIME_WAIT
    // Windows: TCP 127.0.0.1:60546 127.0.0.1:9000 TIME_WAIT 0
    const addrs = cols.filter((c) => /\d$/.test(c) && c.includes(sep));
    const state = cols.find((c) => /^[A-Z_]{4,}$/.test(c) && c !== 'TCP');
    if (addrs.length < 2 || !state) continue;
    const port = (a) => Number(a.slice(a.lastIndexOf(sep) + 1));
    rows.push({ localPort: port(addrs[0]), remotePort: port(addrs[1]), state: state.replace('TIME-WAIT', 'TIME_WAIT') });
  }
  return rows;
}

function readTcpTable() {
  if (process.platform === 'linux') return readLinux();
  if (process.platform === 'win32') return readNetstat(['-ano', '-p', 'tcp'], ':');
  return readNetstat(['-anp', 'tcp'], '.');   // macOS, BSD
}

module.exports = { readTcpTable };
