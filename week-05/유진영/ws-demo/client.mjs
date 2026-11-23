#!/usr/bin/env node
// 터미널 클라이언트: Node 22+에 들어 있는 WebSocket(브라우저와 같은 API)으로 붙어
// 글 → 바이너리 → 1,000바이트 글(길이 126 칸 쓰기) → close(1000)를 차례로 보낸다.
// 서버 터미널에 프레임 바이트가 찍히는 것을 같이 본다.
//   node client.mjs [ws://localhost:8081/ws]
const url = process.argv[2] ?? 'ws://localhost:8081/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(url, ['demo.v1']);
ws.binaryType = 'arraybuffer';

ws.onmessage = (e) =>
  console.log('←', typeof e.data === 'string' ? e.data.slice(0, 60) : `바이너리 [${new Uint8Array(e.data)}]`);
ws.onclose = (e) => console.log(`close code=${e.code} reason="${e.reason}" wasClean=${e.wasClean}`);
ws.onerror = () => console.log('error (서버가 켜져 있나?)');
ws.onopen = async () => {
  console.log(`open: readyState=${ws.readyState} protocol="${ws.protocol}"`);
  const steps = [
    ['글 "Hi"', () => ws.send('Hi')],
    ['바이너리 [1,2,3,255]', () => ws.send(new Uint8Array([1, 2, 3, 255]))],
    ['1,000바이트 글', () => ws.send('a'.repeat(1000))],
    ['close(1000, "bye")', () => ws.close(1000, 'bye')],
  ];
  for (const [name, run] of steps) {
    console.log('→', name);
    run();
    await sleep(700);
  }
};
