# TIME_WAIT 확인용 서버. 일부러 SO_REUSEADDR 를 안 켠다 → 서버가 먼저 끊으면 다시 켤 때 막힌다
import socket

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind(("127.0.0.1", 9000))
server.listen()
print("[서버] 9000 에서 기다리는 중...")

conn, addr = server.accept()
print("[서버] 연결됨:", addr)
input("[서버] Enter 를 누르면 서버가 close() 합니다 → ")
conn.close()
server.close()
print("[서버] close() 끝")
