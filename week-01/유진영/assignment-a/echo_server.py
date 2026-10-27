"""과제 A. HTTP 프레임워크 없이 소켓 API만으로 만든 TCP 에코 서버.

실행:
    python3 echo_server.py                      # 기본: 127.0.0.1:9000
    python3 echo_server.py --host 0.0.0.0       # 모든 주소에서 받기
    python3 echo_server.py --host 0.0.0.0 --port 9100

접속해 보기 (다른 터미널):
    nc 127.0.0.1 9000        # 한 줄 입력하면 그대로 돌아옴, Ctrl+C로 종료
    python3 echo_client.py   # 클라이언트 3개를 동시에 붙여 보기
"""

import argparse
import socket
import threading
from datetime import datetime


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def handle(conn: socket.socket, addr: tuple) -> None:
    # addr = (클라이언트 IP, 클라이언트 포트). 포트는 클라이언트 쪽 OS가 임시로 고른 번호다.
    ip, port = addr[0], addr[1]
    log(f"연결됨   client={ip}:{port}")
    with conn:
        while True:
            data = conn.recv(1024)          # 상대가 연결을 닫으면 b"" 가 온다
            if not data:
                break
            text = data.decode(errors="replace").rstrip("\n")
            log(f"받음     client={ip}:{port} data={text!r}")
            conn.sendall(data)              # 받은 그대로 돌려준다 (에코)
    log(f"연결 끊김 client={ip}:{port}")


def main() -> None:
    parser = argparse.ArgumentParser(description="TCP echo server")
    parser.add_argument("--host", default="127.0.0.1", help="바인딩할 주소 (기본 127.0.0.1)")
    parser.add_argument("--port", type=int, default=9000, help="기다릴 포트 (기본 9000)")
    args = parser.parse_args()

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)   # IPv4 + TCP
    # 서버를 껐다 바로 다시 켤 때 'Address already in use' 를 피한다 (2주차 TIME_WAIT 와 관련)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((args.host, args.port))     # 어느 문(주소)의 몇 번 창구(포트)에서 기다릴지
    server.listen()                         # 이제부터 LISTEN 상태
    log(f"서버 시작 {args.host}:{args.port} 에서 기다리는 중")

    try:
        while True:
            conn, addr = server.accept()    # 3-way handshake 가 끝난 연결 하나를 꺼낸다
            threading.Thread(target=handle, args=(conn, addr), daemon=True).start()
    except KeyboardInterrupt:
        log("서버 종료")
    finally:
        server.close()


if __name__ == "__main__":
    main()
