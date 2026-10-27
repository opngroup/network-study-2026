# 4-way 종료 그림을 단계별(1~6)로, 그리고 움직이는 버전(anim)으로 만든다.
import pathlib, re
HERE = pathlib.Path(__file__).parent
src = (HERE.parent / "close-seq.svg").read_text()

head, body = src.split('<rect width="1000" height="660" fill="#fff"/>', 1)
body = body.replace("</svg>", "")

def cut(start, end=None):
    i = body.index(start)
    j = body.index(end, i) if end else len(body)
    return body[i:j]

# 요소를 단계별로 나눈다 (원본 그림의 주석을 경계로)
headers   = cut("  <!-- 머리 -->", "  <!-- 클라이언트 상태 막대 -->")
c_bars    = cut("  <!-- 클라이언트 상태 막대 -->", "  <!-- 서버 상태 막대 -->")
s_bars    = cut("  <!-- 서버 상태 막대 -->", "  <!-- 클라이언트 코드: close() -->")
c_code    = cut("  <!-- 클라이언트 코드: close() -->", "  <!-- ① FIN -->")
p1        = cut("  <!-- ① FIN -->", "  <!-- ② ACK -->")
p2        = cut("  <!-- ② ACK -->", "  <!-- half-close 구간 -->")
half      = cut("  <!-- half-close 구간 -->", "  <!-- 서버 코드: recv → b'' , close() -->")
s_code    = cut("  <!-- 서버 코드: recv → b'' , close() -->", "  <!-- ③ FIN -->")
p3        = cut("  <!-- ③ FIN -->", "  <!-- ④ ACK -->")
p4        = cut("  <!-- ④ ACK -->", "  <!-- TIME_WAIT 설명 -->")
tw        = cut("  <!-- TIME_WAIT 설명 -->", "  <!-- 바닥 -->")
foot      = cut("  <!-- 바닥 -->")

def rects(block):
    """상태 막대 블록을 (rect+text) 묶음 리스트로 쪼갠다"""
    inner = block.split(">", 1)[1]  # 주석 뒤
    inner = inner[inner.index("<g"):]
    gopen = inner[: inner.index(">") + 1]
    items = re.findall(r'(<rect [^>]*/>(?:<text[^>]*>.*?</text>)?(?:\s*<text[^>]*>[^<]*</text>)?)', inner, re.S)
    return gopen, items

c_g, c_items = rects(c_bars)   # ESTAB, FIN_WAIT_1, FIN_WAIT_2(+설명), TIME_WAIT(+30초), CLOSED
s_g, s_items = rects(s_bars)   # ESTAB, CLOSE_WAIT(+설명), LAST_ACK, CLOSED(+바로 끝)
assert len(c_items) == 5 and len(s_items) == 4, (len(c_items), len(s_items))

def grp(gopen, *items):
    return gopen + "".join(items) + "</g>\n"

# 단계: 0=시작, 1=①, 2=②, 3=half-close, 4=③, 5=④+TIME_WAIT, 6=끝
STEPS = [
    headers + grp(c_g, c_items[0]) + grp(s_g, s_items[0]) + c_code,
    p1 + grp(c_g, c_items[1]),
    p2 + grp(c_g, c_items[2]) + grp(s_g, s_items[1]),
    half + s_code[: s_code.index('<rect x="874" y="330"')],
    s_code[s_code.index('<rect x="874" y="330"'):] + p3 + grp(s_g, s_items[2]),
    p4 + grp(c_g, c_items[3]) + grp(s_g, s_items[3]) + tw,
    grp(c_g, c_items[4]) + foot,
]
BG = '<rect width="1000" height="660" fill="#fff"/>\n'

# 1) 단계별 정지 그림
for n in range(len(STEPS)):
    out = head + BG + "".join(STEPS[: n + 1]) + "</svg>\n"
    (HERE / f"close-step-{n}.svg").write_text(out)

# 2) 움직이는 버전: 단계마다 차례로 나타나고, 패킷은 화살표를 따라 미끄러진다
DELAY = [0, 1.7, 3.5, 5.3, 7.3, 9.3, 11.4]  # 초 — 점이 도착한 뒤에 나타난다
css = ["<style>", ".s{opacity:0;animation:in .6s ease-out forwards}",
       "@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}"]
for n, d in enumerate(DELAY):
    css.append(f".s{n}{{animation-delay:{d}s}}")
# 날아가는 점: (출발x, 도착x, y, 색, 시작초)
dots = [(294, 704, 110, "#7b4bc4", 0.6), (706, 296, 170, "#4b5563", 2.4),
        (706, 296, 276, "#d08a00", 4.2), (706, 296, 350, "#7b4bc4", 6.2), (294, 704, 410, "#4b5563", 8.2)]
dot_svg = []
for k, (x1, x2, y, col, t) in enumerate(dots):
    css.append(f"@keyframes m{k}{{0%{{transform:translate({x1}px,{y}px);opacity:0}}10%{{opacity:1}}90%{{opacity:1}}100%{{transform:translate({x2}px,{y}px);opacity:0}}}}")
    css.append(f".d{k}{{opacity:0;animation:m{k} 1.1s ease-in-out {t}s forwards}}")
    dot_svg.append(f'<g class="d{k}"><circle r="15" fill="{col}" opacity=".25"/><circle r="10" fill="#fff" stroke="{col}" stroke-width="5"/></g>')
css.append("</style>")
anim = head + "\n".join(css) + "\n" + BG
for n, block in enumerate(STEPS):
    anim += f'<g class="s s{n}">{block}</g>\n'
anim += "\n".join(dot_svg) + "\n</svg>\n"
(HERE / "close-anim.svg").write_text(anim)
print("ok", len(STEPS), "steps")
