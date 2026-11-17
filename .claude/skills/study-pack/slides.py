#!/usr/bin/env python3
"""study-pack 장표 빌드: 내용 폴더의 slides.html(<section> 조각들)을 템플릿에 채워
발표 장표 HTML과 PDF를 만들고, 한눈에 보는 미리보기 한 장을 찍는다.

    python3 slides.py <내용 폴더> <출력 폴더>

출력: <출력 폴더>/slides.html, <출력 폴더>/<slides_title>.pdf
미리보기: 임시 폴더의 overview.png (경로를 찍어 준다. 저장소에 넣지 않는다)
"""
import json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "assets" / "slides-template.html"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def fail(msgs):
    for m in msgs:
        print("오류:", m, file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) != 3:
        fail(["사용법: python3 slides.py <내용 폴더> <출력 폴더>"])
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    c = json.loads((src / "content.json").read_text(encoding="utf-8"))
    if "slides_title" not in c:
        fail(["content.json에 slides_title(장표 제목, PDF 파일 이름)이 없음"])
    body = (src / "slides.html").read_text(encoding="utf-8").strip("\n")

    sections = re.findall(r'<section class="slide[^"]*">', body)
    errors = []
    if not sections:
        errors.append('slides.html에 <section class="slide"> 장표가 없음')
    if body.count("<section") != body.count("</section>"):
        errors.append("<section> 여는 태그와 닫는 태그 수가 다름")
    elif sections and "dark" not in sections[0]:
        errors.append("첫 장표(표지)는 slide dark여야 함")
    if "우리 서비스에서는" not in body:
        errors.append('정리 장표에 "우리 서비스에서는" 박스가 없음 (발표 규칙)')
    if errors:
        fail(errors)

    out.mkdir(parents=True, exist_ok=True)
    html = TEMPLATE.read_text(encoding="utf-8").replace("{{TITLE}}", c["slides_title"]).replace("{{SLIDES}}", body)
    (out / "slides.html").write_text(html, encoding="utf-8")

    pdf = out / f"{c['slides_title']}.pdf"
    subprocess.run([CHROME, "--headless=new", "--no-pdf-header-footer", "--virtual-time-budget=15000",
                    f"--print-to-pdf={pdf}", (out / "slides.html").resolve().as_uri()],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pages = len(re.findall(rb"/Type\s*/Page[^s]", pdf.read_bytes()))
    if pages != len(sections):
        fail([f"PDF {pages}쪽, 장표 {len(sections)}장: 넘친 장표가 있음"])

    tmp = Path(tempfile.mkdtemp(prefix="slides-"))
    if shutil.which("pdftoppm"):
        subprocess.run(["pdftoppm", "-r", "30", "-png", str(pdf), str(tmp / "p")], check=True)
        imgs = sorted(tmp.glob("p-*.png"))
        grid = "".join(f'<figure style="margin:0"><img src="{i.name}" style="width:100%;display:block">'
                       f'<figcaption style="font:13px sans-serif;padding:2px 4px">{n}</figcaption></figure>'
                       for n, i in enumerate(imgs, 1))
        (tmp / "o.html").write_text('<body style="margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:6px">'
                                    + grid + "</body>", encoding="utf-8")
        rows = (len(imgs) + 2) // 3
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", f"--window-size=1500,{rows * 300 + 40}",
                        "--virtual-time-budget=3000", f"--screenshot={tmp / 'overview.png'}", (tmp / "o.html").as_uri()],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"미리보기: {tmp / 'overview.png'}")
    else:
        print("pdftoppm이 없어 미리보기는 건너뜀 (brew install poppler)")
    print(f"{out / 'slides.html'} · {pdf}: 장표 {len(sections)}장")


if __name__ == "__main__":
    main()
