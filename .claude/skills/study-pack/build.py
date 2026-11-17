#!/usr/bin/env python3
"""study-pack 빌드: 내용 폴더(content.json + study.html)를 템플릿에 채워 HTML 한 장을 만든다.

    python3 build.py <내용 폴더> <출력 .html>

검사에 걸리면 무엇이 틀렸는지 적고 1로 끝난다. 통과하면 묶음별 카드 수를 찍는다.
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "assets" / "template.html"
REQUIRED = ["title", "brand", "storage_key", "card_eyebrow", "card_title", "study", "decks", "cards"]
CALLOUTS = ["tip", "trap", "mem", "exam"]


def fail(errors):
    for e in errors:
        print("오류:", e, file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) != 3:
        fail(["사용법: python3 build.py <내용 폴더> <출력 .html>"])
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    c = json.loads((src / "content.json").read_text(encoding="utf-8"))
    errors = [f"content.json에 {k}가 없음" for k in REQUIRED if k not in c]
    if errors:
        fail(errors)
    study = (src / c["study"]).read_text(encoding="utf-8")

    deck_ids = [d["id"] for d in c["decks"]]
    for d in deck_ids:
        if not re.fullmatch(r"[a-z0-9-]+", d):
            errors.append(f"묶음 id '{d}'는 영어 소문자·숫자·하이픈만 (주소 #cards-{d}에 쓰임)")
    counts = {d: 0 for d in deck_ids}
    for i, card in enumerate(c["cards"]):
        for k in ("d", "q", "a"):
            if not card.get(k):
                errors.append(f"카드 {i + 1}: '{k}'가 비어 있음")
        if card.get("d") not in counts:
            errors.append(f"카드 {i + 1}: 없는 묶음 '{card.get('d')}'")
        else:
            counts[card["d"]] += 1
        if card.get("n") is not None and not isinstance(card["n"], list):
            errors.append(f"카드 {i + 1}: 'n'은 문단 배열이어야 함")
    errors += [f"묶음 '{d}'에 카드가 없음" for d, n in counts.items() if n == 0]

    # 정리 노트 검사: 단원마다 한 줄 요약, 카드 바로가기, 그리고 노트 전체에 상자 네 종류
    units = re.findall(r'<section class="unit(?! final)[^"]*" id="([^"]+)">([\s\S]*?)</section>', study)
    if not units:
        errors.append('study.html에 <section class="unit" id="u1"> 단원이 없음')
    for uid, body in units:
        if 'class="one"' not in body:
            errors.append(f"단원 {uid}: 한 줄 요약(<p class=\"one\">)이 없음")
        link = re.search(r'href="#cards-([a-z0-9-]+)"', body)
        if not link:
            errors.append(f"단원 {uid}: 카드 바로가기(<a class=\"mini\" href=\"#cards-<묶음>\">)가 없음")
        elif link.group(1) not in counts:
            errors.append(f"단원 {uid}: 없는 묶음 #cards-{link.group(1)}로 연결")
    for kind in CALLOUTS:
        if f'class="call {kind}"' not in study:
            errors.append(f'정리 노트에 "{kind}" 상자가 하나도 없음')
    if 'href="#cards"' not in study:
        errors.append('정리 노트에 전체 카드로 가는 버튼(<a class="cta" href="#cards">)이 없음')

    def count(m):
        key = m.group(1)
        if key == "all":
            return str(len(c["cards"]))
        if key not in counts:
            errors.append(f"{{{{COUNT:{key}}}}}: 없는 묶음")
            return "?"
        return str(counts[key])

    study = re.sub(r"\{\{COUNT:([a-z0-9-]+)\}\}", count, study)
    if errors:
        fail(errors)

    def js(v):
        return json.dumps(v, ensure_ascii=False, indent=1).replace("</", "<\\/")

    html = TEMPLATE.read_text(encoding="utf-8")
    for k, v in {
        "{{TITLE}}": c["title"], "{{BRAND}}": c["brand"], "{{STUDY}}": study.strip("\n"),
        "{{CARD_EYEBROW}}": c["card_eyebrow"], "{{CARD_TITLE}}": c["card_title"],
        "{{DECKS_JSON}}": js(c["decks"]), "{{CARDS_JSON}}": js(c["cards"]),
        "{{STORAGE_KEY_JSON}}": json.dumps(c["storage_key"]),
    }.items():
        html = html.replace(k, v)
    left = re.findall(r"\{\{[A-Z_:a-z0-9-]+\}\}", html)
    if left:
        fail([f"채우지 못한 자리: {', '.join(sorted(set(left)))}"])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{out}: 단원 {len(units)}개, 카드 {len(c['cards'])}장 ("
          + ", ".join(f"{d} {n}" for d, n in counts.items()) + ")")


if __name__ == "__main__":
    main()
