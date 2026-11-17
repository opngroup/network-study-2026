# study.html 부품

`study.html`은 `<main class="note">` 안에 들어갈 HTML 조각입니다. 아래 부품만 쓰면 템플릿의 스타일이 그대로 맞습니다. 다 쓴 예는 `week-04/유진영/study-pack/study.html`에 있습니다.

## 뼈대

```html
<section class="hero">
  <div class="eyebrow">NETWORK STUDY · WEEK 5 · 정리 노트</div>
  <h1>주제: 이것만 알면 된다</h1>
  <p class="lead">오늘 범위를 문제 두세 개로 묶는 한 문단. 진단 퀴즈 Q번호를 괄호로.</p>
  <p>상자 읽는 법 한 문단("쪽집게"는 꼭 외울 것, "함정"은 다들 틀리는 것, "출제 예상"은 질문으로 나올 만한 것).</p>
  <a class="cta" href="#cards">암기 카드로 복습하기 →</a>
  <nav class="toc" aria-label="단원"><a href="#u1">1. …</a> … <a href="#u7">마지막 정리</a></nav>
</section>

<section class="unit" id="u1">
  <div class="head"><span class="no">UNIT 1 · Q20</span><h2>단원 제목</h2></div>
  <p class="one">이 단원에서 외울 한 문장.</p>
  <h3>소제목</h3>
  <p>…</p> <ul><li>…</li></ul>
  <!-- 상자·표·그림 -->
  <a class="mini" href="#cards-<묶음 id>">이 단원 카드 {{COUNT:<묶음 id>}}장 →</a>
</section>

<section class="unit final" id="u7">
  <div class="eyebrow" style="color:inherit;opacity:.7">시험 직전 5문장</div>
  <h2>이 다섯 줄만은 입으로 말할 수 있게</h2>
  <ol><li>…</li></ol>
  <a class="cta" href="#cards">암기 카드 {{COUNT:all}}장으로 복습하기 →</a>
</section>
```

- 단원 id는 `u1`, `u2` …, 마지막 정리는 `class="unit final"`.
- `{{COUNT:<묶음 id>}}`와 `{{COUNT:all}}`은 빌드가 실제 카드 수로 바꿉니다. 숫자를 손으로 쓰지 않습니다.
- 주소 조각(`#…`)은 영어 소문자·숫자·하이픈만. `note`, `cards`, `cards-…`는 템플릿이 화면 전환에 씁니다.

## 상자 네 종류

```html
<div class="call tip"><span class="lb">쪽집게</span><p>꼭 외울 것. 핵심은 <b>굵게</b>.</p></div>
<div class="call trap"><span class="lb">함정</span><p>다들 틀리는 것과 왜 틀리는지.</p></div>
<div class="call mem"><span class="lb">외우는 법</span><p>비유, 대비되는 짝, 줄임말.</p></div>
<div class="call exam"><span class="lb">출제 예상</span>
  <div class="qa"><b>Q</b><span>질문</span><b>A</b><span>답</span></div>
</div>
```

`lb`에 덧붙여 성격을 좁혀도 됩니다: `함정 · 휴리스틱 캐시`, `출제 예상 · 계산`, `쪽집게 · 실측`. 한 `qa` 안에 Q/A 쌍을 여러 개 이어 써도 됩니다.

## 코드·헤더 원문

```html
<pre class="c">GET /logo.png HTTP/1.1        ← 요청: 무엇을
Host: example.com             ← 요청 헤더</pre>
```

줄바꿈과 공백이 그대로 나옵니다. `<`는 `&lt;`로 씁니다. 실제 요청·응답, 명령 출력을 보여 줄 때 씁니다.

## 표

```html
<div class="tbl"><table>
  <tr><th>묶음</th><th>값</th><th>뜻</th></tr>
  <tr><td class="grp" rowspan="2">기한</td><td><code>max-age</code></td><td>…</td></tr>
  <tr class="hl">…</tr>   <!-- 청록 강조: 정답·권장 -->
  <tr class="hl-o">…</tr> <!-- 주황 강조: 위험·예외 -->
</table></div>
```

## 그림

```html
<!-- 층·경로: 왼쪽에서 오른쪽으로 거쳐 가는 것. p=청록, s=주황, o=잉크 -->
<div class="layers">
  <div class="layer p"><b>브라우저</b><span>설명</span></div><span class="arrow">→</span>
  <div class="layer o"><b>서버</b><span>설명</span></div>
</div>

<!-- 갈래: 조건에 따라 셋으로 나뉘는 판단 -->
<div class="fork">
  <div class="x1"><span class="cond">조건</span><span class="act">하는 일</span><span class="code">200</span></div>
  <div class="x2">…</div><div class="x3">…</div>
</div>

<!-- 둘 비교: 헷갈리는 짝 -->
<div class="vs">
  <div class="a1"><span class="t">no-cache</span><span class="s">한 줄 뜻</span><p>설명</p></div>
  <div class="a2"><span class="t">no-store</span><span class="s">한 줄 뜻</span><p>설명</p></div>
</div>

<!-- 주고받기: 클라이언트와 서버 사이 메시지 순서 -->
<div class="seq" role="img" aria-label="무슨 흐름인지">
  <div class="hd"><span>브라우저</span><span></span><span>서버</span></div>
  <div class="m l"><span class="side">① 설명</span><span class="msg">GET /a</span><span></span></div>
  <div class="m r"><span></span><span class="msg ok">304 Not Modified</span><span class="side">설명</span></div>
  <div class="gap">… 시간이 지남 …</div>
</div>
```

`m l`은 왼쪽 → 오른쪽, `m r`은 오른쪽 → 왼쪽 화살표입니다. `msg ok`는 청록으로 강조합니다.
