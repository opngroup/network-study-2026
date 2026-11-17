# week04 · 캐시, ETag, 콘텐츠 협상

진단 퀴즈 Q20, Q21, Q23. 캐시는 신선하면 묻지 않고, 상하면 지문(ETag)을 들고 묻고, 안 바뀌었으면 304를 받는다. 같은 주소에 다른 응답을 주면(콘텐츠 협상) `Vary`를 붙인다.

원래 11/9 회차였는데 11/12로 밀렸고, 11/12도 건너뛰어 이번 주(11/16 주)에 진행합니다.

## 발표 자료

- [발표 장표 (PDF)](<./캐시, ETag, 콘텐츠 협상.pdf>) — 19장, 약 17분. 처음 배우는 사람 기준으로 캐시가 뭔지부터 설명한다(11/17 개정). 과제 C 돌아보기 2장 → 퀴즈 다시 풀기 → 바탕 2장(요청·응답·헤더 → 헤더는 누가 보내나) → 캐시가 뭔가 → 캐시가 있는 곳 → 유통기한 → 세 갈래 판단 → ETag와 304 → MDN에서 직접 보기 → 응답의 Cache-Control(no-cache와 no-store, 값 여덟 개) → 요청의 Cache-Control(새로고침) → 콘텐츠 협상 → Vary → 사이트별 정책 비교 → 정리
- [장표 (HTML)](./slides.html) — 원본 조각은 [`study-pack/slides.html`](./study-pack/slides.html). 고친 뒤 아래 명령으로 HTML과 PDF를 다시 만든다
- [이전 판 스터디 노트](<./4주차 발표 스터디 노트 캐시, ETag, 콘텐츠 협상.md>) — 11/12 장표(15장) 기준. 장표 번호가 지금 장표와 다르다. 과제 C 데모 순서와 과제 C 질문은 여기에만 있다
- [발표 대본](<./발표 대본.md>) — 발표할 때 옆에 띄워 두는 것: 장표별 말할 문장과 시간, 데모가 안 될 때, 질문 빠른 답
- [정리 노트와 암기 카드 (HTML)](./flashcards.html) — 처음 배우는 사람 기준 정리 노트(단원 8개)를 읽고, 카드 83장으로 복습. 브라우저로 바로 열면 된다. 내용 원본은 [`study-pack/`](./study-pack/)이고 `study-pack` 스킬로 다시 만든다
- [`demo.sh`](./demo.sh) — 장표 12·16·18 라이브 데모. ETag를 복사하지 않아도 200 → 304가 한 번에 돈다 (`bash demo.sh etag`)

```bash
# 저장소 맨 위에서
python3 .claude/skills/study-pack/slides.py week-04/유진영/study-pack week-04/유진영
python3 .claude/skills/study-pack/build.py  week-04/유진영/study-pack week-04/유진영/flashcards.html
```

장표의 헤더 값과 크기는 curl로 받은 실제 값입니다(11/17 다시 잼, 장표 9의 age 예시만 11/12 값).

## 발표 전에 채울 것

- [ ] 장표 19 "우리 서비스에서는" 박스: 우리 API 응답의 `Cache-Control`, 로그인 API의 `private`·`no-store` 여부, 프론트 번들 파일명 해시와 캐시 기간
- [ ] 과제 C 데모용으로 `week-03/유진영/assignment-c`에서 `docker compose up -d --build` 미리 해 두기

## 지난주 과제 C

결과와 코드: [`week-03/유진영/assignment-c/`](../../week-03/유진영/assignment-c/)

## 과제 D. ETag 캐시와 프로토콜 비교

다음 주까지. 내용은 루트 README의 4주차 항목.

- [ ] 과제 C의 `GET /orders/:id`에 ETag를 붙이고, `curl`로 304가 본문 없이 오는 것 확인
- [ ] 우리 서비스와 자주 쓰는 사이트 3곳의 DevTools Protocol 열(h1·h2·h3)과 Cache-Control 값을 표로 정리 (장표 18의 표가 출발점)
