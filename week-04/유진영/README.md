# week04 · 캐시, ETag, 콘텐츠 협상

진단 퀴즈 Q20, Q21, Q23. 캐시는 신선하면 묻지 않고, 상하면 지문(ETag)을 들고 묻고, 안 바뀌었으면 304를 받는다. 같은 주소에 다른 응답을 주면(콘텐츠 협상) `Vary`를 붙인다.

원래 11/9 회차였는데 11/12로 밀렸습니다.

## 발표 자료

- [발표 장표 (PDF)](<./캐시, ETag, 콘텐츠 협상.pdf>) — 15장, 약 17분. 지난주 과제 C 돌아보기 2장(한 일과 결과 → 알게 된 것) → 퀴즈 다시 풀기 → 배경 지식 3장(캐시가 있는 곳 → 유통기한 → 세 갈래 판단) → no-cache와 no-store → Cache-Control 값 여덟 개 → ETag와 304 → MDN에서 직접 보기 → 콘텐츠 협상 → Vary → 사이트별 정책 비교 → 정리
- [장표 원본 (HTML)](./slides.html) — 고친 뒤 PDF 다시 만들기: 아래 명령
- [스터디 노트](<./4주차 발표 스터디 노트 캐시, ETag, 콘텐츠 협상.md>) — 장표별 쉬운 설명, 받을 만한 질문, 오늘 순서와 과제 C 데모 순서

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --virtual-time-budget=15000 --print-to-pdf="캐시, ETag, 콘텐츠 협상.pdf" "file://$PWD/slides.html"
```

장표 11·14의 헤더 값과 크기는 11/12 오전에 curl로 받은 실제 값입니다. 사이트가 바뀌면 달라질 수 있습니다.

## 발표 전에 채울 것

- [ ] 장표 15 "우리 서비스에서는" 박스: 우리 API 응답의 `Cache-Control`, 로그인 API의 `private`·`no-store` 여부, 프론트 번들 파일명 해시와 캐시 기간
- [ ] 과제 C 데모용으로 `week-03/유진영/assignment-c`에서 `docker compose up -d --build` 미리 해 두기

## 지난주 과제 C

결과와 코드: [`week-03/유진영/assignment-c/`](../../week-03/유진영/assignment-c/)

## 과제 D. ETag 캐시와 프로토콜 비교

다음 주까지. 내용은 루트 README의 4주차 항목.

- [ ] 과제 C의 `GET /orders/:id`에 ETag를 붙이고, `curl`로 304가 본문 없이 오는 것 확인
- [ ] 우리 서비스와 자주 쓰는 사이트 3곳의 DevTools Protocol 열(h1·h2·h3)과 Cache-Control 값을 표로 정리 (장표 14의 표가 출발점)
