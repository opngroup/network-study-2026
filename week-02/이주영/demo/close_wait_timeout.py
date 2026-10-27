# CLOSE_WAIT 실측: 클라이언트가 먼저 끊고 서버 코드가 close() 를 안 부르면 어떻게 되나 (macOS)
# 실행: python3 close_wait_timeout.py   (약 65초)
import socket
import subprocess
import time

PORT = 9001


def states():
    rows = [l.split() for l in subprocess.run(["netstat", "-an", "-p", "tcp"], capture_output=True, text=True).stdout.splitlines()
            if f".{PORT} " in l and "LISTEN" not in l]
    srv = next((r[5] for r in rows if r[3].endswith(f".{PORT}")), "-")
    cli = next((r[5] for r in rows if not r[3].endswith(f".{PORT}")), "-")
    return srv, cli


fin = subprocess.run(["sysctl", "-n", "net.inet.tcp.fin_timeout"], capture_output=True, text=True).stdout.strip()
print(f"$ sysctl net.inet.tcp.fin_timeout  →  {fin} ms\n")
print(f"{'경과':>6}   {'서버 (close 안 함)':<20} {'클라이언트 (먼저 끊음)':<20}")
print("-" * 56)

server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", PORT))
server.listen()
client = socket.socket()
client.connect(("127.0.0.1", PORT))
conn, _ = server.accept()
s, c = states()
print(f"{'연결':>6}   {s:<20} {c:<20}")

client.close()  # 클라이언트가 먼저 끊는다 (FIN)
t0 = time.time()
last, next_tick = None, 0
while time.time() - t0 < 65:
    t = time.time() - t0
    s, c = states()
    if (s, c) != last or t >= next_tick:
        mark = "  ← 바뀜" if last and (s, c) != last else ""
        print(f"{t:5.0f}초   {s:<20} {c:<20}{mark}", flush=True)
        last, next_tick = (s, c), (int(t) // 5 + 1) * 5
    time.sleep(0.5)

print("-" * 56)
print(f"서버 코드의 conn 은 아직 열려 있다 (fd {conn.fileno()}) — close() 를 안 했으니까")
try:
    conn.send(b"x")
    time.sleep(0.3)
    conn.send(b"y")
    print("conn.send() → 성공")
except OSError as e:
    print(f"conn.send() → {type(e).__name__}: {e}")
conn.close()
server.close()
