"""에코 서버에 클라이언트 여러 개를 동시에 붙여서, 각 연결의 출발지 포트가 다른지 확인한다.

실행:
    python3 echo_client.py                         # 127.0.0.1:9000 에 3개
    python3 echo_client.py --host 192.168.0.10 --count 3
"""

import argparse
import socket
import threading

lock = threading.Lock()


def one_client(i: int, host: str, port: int, barrier: threading.Barrier) -> None:
    try:
        sock = socket.create_connection((host, port), timeout=3)
    except OSError as e:
        with lock:
            print(f"client#{i} 연결 실패: {e}")
        barrier.abort()
        return
    with sock:
        my_ip, my_port = sock.getsockname()[:2]      # 내 쪽(출발지) 주소와 포트
        barrier.wait()                               # 모두 연결된 상태에서 동시에 보낸다
        msg = f"hello from client#{i}\n".encode()
        sock.sendall(msg)
        reply = sock.recv(1024).decode().rstrip("\n")
        with lock:
            print(f"client#{i}  출발지 {my_ip}:{my_port}  ->  {host}:{port}  답장 {reply!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9000)
    parser.add_argument("--count", type=int, default=3)
    args = parser.parse_args()

    barrier = threading.Barrier(args.count)
    threads = [threading.Thread(target=one_client, args=(i + 1, args.host, args.port, barrier))
               for i in range(args.count)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()


if __name__ == "__main__":
    main()
