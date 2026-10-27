# 3-way handshake 그림을 단계별(0~4)로 쪼갠다.
import pathlib, re
HERE = pathlib.Path(__file__).parent
L = (HERE.parent / "handshake-seq.svg").read_text().splitlines()
bump = {"12": "14", "13": "15", "15": "17", "17": "19"}
L = [re.sub(r'font-size="(1[2357])"', lambda m: f'font-size="{bump[m.group(1)]}"', l) for l in L]
ln = lambda a, b: "\n".join(L[a - 1:b]) + "\n"          # 1부터 세는 줄 번호
head, bg = ln(1, 5), ln(6, 6)
gopen, gclose = L[14], "  </g>\n"                        # 상태 막대 묶음 여는 줄
bar = lambda n: gopen + "\n" + L[n - 1] + "\n" + gclose
STEPS = [
    ln(8, 12) + bar(16) + bar(20) + ln(26, 40),           # 시작: CLOSED · LISTEN · 해 둔 일
    ln(42, 46) + bar(17) + bar(21),                        # ① SYN → SYN_SENT · SYN_RCVD
    ln(48, 52),                                            # ② SYN+ACK
    ln(54, 58) + bar(18) + bar(22),                        # ③ ACK → 양쪽 ESTABLISHED
    ln(60, 63),                                            # 범례
]
for n in range(len(STEPS)):
    (HERE / f"open-step-{n}.svg").write_text(head + bg + "".join(STEPS[: n + 1]) + "</svg>\n")
print("ok", len(STEPS))
