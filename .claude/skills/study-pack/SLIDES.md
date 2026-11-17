# 발표 장표와 대본

장표 조각은 내용 폴더의 `slides.html`에 `<section>`을 이어 씁니다. 틀(1440×810, 색, 글꼴)은 `assets/slides-template.html`에 있고 `slides.py`가 채웁니다. 다 쓴 예: `week-04/유진영/study-pack/slides.html`(19장)과 `week-04/유진영/발표 대본.md`.

## 장표 순서 (발표 12~17분)

정리 노트의 단원 순서를 그대로 따르고, 단원 하나를 장표 1~3장으로 옮깁니다.

1. **표지** (`slide dark`): 주제, 한 줄 부제("○○가 뭔지부터 차근차근"), 발표자 · 주차 · 책 범위.
2. **지난주 과제 돌아보기 2장**: ① 한 일과 결과(카드 셋) ② 해 보고 알게 된 것(번호 줄 넷, 마지막 줄은 오늘 주제로 넘어가는 다리).
3. **진단 퀴즈 다시 풀기 1장**: 이 주제의 Q번호 문제와 답(발표 규칙: 문항을 다시 푸는 것으로 시작).
4. **바탕 1~2장**: 주제가 기대는 개념, 그리고 오늘 나오는 용어·헤더가 **누가 보내는지** 표.
5. **주제 정의 1장**: "○○가 뭔가" 한 문장 정의, 왜 필요한가(카드 셋), 대신 생기는 문제.
6. **본론**: 개념마다 그림이나 표 한 장. 퀴즈 문항을 푸는 장표의 eyebrow에 `Q번호`. 헷갈리는 짝(같은 이름 다른 뜻)은 카드 두 장을 나란히.
7. **직접 보기 1~2장**: 터미널·DevTools 실측 결과(날짜). 발표 중 `demo.sh`로 다시 돌린다(발표 규칙: 직접 보여 주기 우선).
8. **정리** (`slide dark`): 다섯 줄(`ol.sum`)과 **"우리 서비스에서는"** 박스(발표 규칙, `slides.py`가 확인).

## 부품

```html
<!-- N 이름 -->                               장표마다 번호 주석
<section class="slide">                       밝은 본문 (표지·정리는 slide dark)
  <div class="eyebrow">Q20 · 짧은 갈래</div>    무엇에 대한 장표인지
  <h1>한 문장 제목</h1>
  …
  <div class="foot">출처나 각주</div>          아래 왼쪽
</section>
```

| 쓰임 | 부품 |
| --- | --- |
| 카드 2·3개 나란히 | `<div class="grid g2">`/`g3` 안에 `<div class="card top-t">`(청록)·`top-o`(주황)·`top-p`(보라), 속에 `.k`(꼬리표) `.h`(굵은 한 줄) `p` |
| 번호 줄 | `<div class="rows"><div class="row hl-o"><div class="n">01</div><div>…</div></div>`, 강조는 `hl-o`·`hl-t` |
| 터미널·헤더 | `<div class="code"><span class="lab">제목</span>…</div>`, 줄 안 강조 `.hl`(주황) `.ok`(청록) `.c`(회색). 줄바꿈이 그대로 나온다 |
| 표 | `<table>`, 강조 줄 `tr.hl`(청록) `tr.hl-o`(주황) |
| 상자 | `<div class="box t">`(청록 바탕) `box o`(주황 테두리, 경고) |
| 퀴즈 | `<div class="quiz"><div class="id">Q20</div><div class="q">문제</div><div class="a">답</div></div>` |
| 주고받기 | `<div class="flow"><div class="actor">브라우저</div><div class="msgs"><div class="msg">→ …</div><div class="msg r t">… ←</div></div><div class="actor">서버</div></div>`, `msg r`은 오른쪽 정렬, `t`·`o`는 바탕색 |
| 층·경로 | `<div class="layers"><div class="layer priv|shared|origin"><div class="nm">이름</div><div class="sub">설명</div></div>…</div>` + `<div class="arrow-row">` |
| 정리 | `<ol class="sum">` + `<div class="box us"><div class="lbl">우리 서비스에서는</div>…</div>` (dark 장표 안) |
| 글자 강조 | `<b class="t">` `<b class="o">` `<b class="p">`, 회색 글 `.muted` |

한 장에 들어가는 양: 표는 8줄, 카드 줄 하나 + 상자 하나, 코드 상자는 12줄 안팎. `slides.py`가 PDF 쪽수와 장표 수를 비교해 넘친 장표를 잡고, 미리보기 한 장(`overview.png`)으로 전체를 한 번 봅니다.

## 대본 (`발표 대본.md`)

장표와 같은 폴더에 둡니다. 순서:

1. 머리말: 언제 발표하는지, 정리 노트 링크.
2. **시간표**: 구간 · 장표 · 시간 · 누적 표. 합계는 README 발표 시간에 맞추고, "시간이 모자라면" 건너뛸 장표를 적습니다.
3. **시작 10분 전** 체크리스트: 데모 한 번 돌리기, 터미널 글자 크기, PDF 열기, 지난주 과제 데모 준비, "우리 서비스에서는" 채우기.
4. **장표별 대본**: 장표마다 `### N · 제목 (시간)`과 굵게 쓴 **꼭 말할 문장** 한두 개, 짚을 곳. 데모 장표에는 명령, 단계별로 짚을 값, **데모가 안 될 때** 할 말.
5. **막혔을 때 붙잡을 문장 다섯 개**: 정리 장표의 다섯 줄과 같게.
6. **질문 받을 때** 표: 질문 · 짧은 답 · 정리 노트 단원.
7. 다음 발표자로 넘기는 한 문장, 끝나고 과제 안내.

## 데모 스크립트 (`demo.sh`)

명령으로 보여 줄 게 있으면 그 주차 폴더에 둡니다. 하위 명령으로 장표별로 나누고, 단계 사이에 엔터를 기다리며, 손으로 값을 복사하지 않게 앞 단계 출력을 변수로 넘깁니다. 예: `week-04/유진영/demo.sh`(`etag`·`lang`·`sites`).
