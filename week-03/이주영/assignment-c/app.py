# 과제 C: 멱등 POST /orders + 일부러 느린 주소(/slow) · 일부러 터지는 주소(/boom)
# 실행: docker compose up
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

orders = []  # 메모리에만 둔다
seen = {}  # Idempotency-Key -> 그 키로 처음 만든 주문


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/orders":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")

        key = self.headers.get("Idempotency-Key")
        if key in seen:  # 본 적 있는 키 → 만들지 않고 처음 응답을 그대로 돌려준다
            print(f"재시도로 판단 key={key} → 기존 주문 {seen[key]} 그대로 응답")
            self._json(201, seen[key])
            return

        order = {"id": len(orders) + 1, "item": body.get("item")}
        orders.append(order)
        if key:
            seen[key] = order
        print(f"주문 생성 {order}  (지금 총 {len(orders)}건)")
        self._json(201, order)

    def do_GET(self):
        if self.path == "/orders":
            self._json(200, orders)
        elif self.path == "/slow":  # 5초 걸리는 응답 → nginx 가 2초만 기다리면 504
            time.sleep(5)
            self._json(200, {"ok": "느리지만 답은 했다"})
        elif self.path == "/boom":  # 앱 안에서 예외 → 앱이 스스로 500 을 답한다
            try:
                1 / 0
            except Exception as e:
                print(f"앱 예외: {e!r}")
                self._json(500, {"error": "앱에서 예외가 났다"})
        else:
            self.send_error(404)

    def _json(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


HTTPServer(("0.0.0.0", 9100), Handler).serve_forever()
