# 체크 ③ 용 HTTP 서버. 요청마다 "ok" 를 돌려주고, 새 연결이 올 때마다 로그를 찍는다
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # 이 줄이 없으면 HTTP/1.0 이라 응답마다 연결을 끊는다

    def setup(self):
        super().setup()
        print("새 연결:", self.client_address)

    def do_GET(self):
        body = b"ok"
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
