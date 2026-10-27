# CLOSE_WAIT 를 눈으로 확인한다.
# 클라이언트가 먼저 끊었는데 서버 코드가 close() 를 안 부르면, 서버 연결이 CLOSE_WAIT 에 멈춘다.
# 실행: python3 close_wait_demo.py
import socket
import subprocess
import time

PORT = 9000
WAIT = 10  # 서버 코드가 close() 를 미루는 시간(초)


def show(t, label):
    rows = [l.split() for l in subprocess.run(["netstat", "-an", "-p", "tcp"], capture_output=True, text=True).stdout.splitlines()
            if f".{PORT} " in l and "LISTEN" not in l]
    states = []
    for r in rows:
        local, state = r[3], r[5]
        who = "서버      " if local.endswith(f".{PORT}") else "클라이언트"
        states.append(f"{who} {state:<12}")
    print(f"[{t:4.1f}초] {label:<34} | " + (" · ".join(sorted(states)) or "(연결 없음)"))


server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", PORT))
server.listen()

start = time.time()
el = lambda: time.time() - start

client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client.connect(("127.0.0.1", PORT))
conn, _ = server.accept()
show(el(), "연결됨")

time.sleep(1)
client.close()  # ① FIN — 클라이언트가 먼저 끊는다
time.sleep(0.2)
show(el(), "클라이언트 close() → FIN")

print(f"         … 서버 코드는 close() 를 {WAIT}초 동안 안 부른다 …")
for _ in range(WAIT):
    time.sleep(1)
    show(el(), "서버 코드가 아직 close() 안 함")

print(f"         ↓ 이제야 서버 코드가 conn.close() ↓")
conn.close()  # ③ FIN — 서버 코드가 드디어 닫는다
time.sleep(0.2)
show(el(), "서버 close() → FIN")
time.sleep(1)
show(el(), "1초 뒤")
server.close()
