# week05 · WebSocket 핸드셰이크와 프레임

진단 퀴즈 Q32. WebSocket은 `Upgrade: websocket`을 붙인 HTTP 요청으로 시작하고, 서버가 `101 Switching Protocols`로 답하면 같은 TCP 연결에서 양쪽이 아무 때나 프레임을 보낸다.

README 일정표의 11/16 회차가 한 주 밀려 11/24에 진행합니다.

## 발표 자료

- [발표 장표 (PDF)](<./WebSocket 핸드셰이크와 프레임.pdf>) — 20장, 약 17분. HTTP가 왜 서버 쪽에서 먼저 말을 못 하는지부터 시작한다. 과제 D 돌아보기 2장 → 퀴즈 Q32 → 바탕 2장(HTTP는 묻고 답하면 끝 → 누가 보내나) → WebSocket이 뭔가 → 세 방식 비교 → 핸드셰이크 → Key와 Accept → 거절 응답 → 프레임 → "Hi"의 바이트 → 길이 칸 → 마스킹 → ping·pong → close → 라이브 데모 → 실무 → 정리
- [장표 (HTML)](./slides.html) — 원본 조각은 [`study-pack/slides.html`](./study-pack/slides.html)
- [발표 대본](<./발표 대본.md>) — 장표별 말할 문장과 시간, 데모가 안 될 때, 질문 빠른 답
- [정리 노트와 암기 카드 (HTML)](./flashcards.html) — 처음 배우는 사람 기준 정리 노트(단원 9개)와 카드 85장. 내용 원본은 [`study-pack/`](./study-pack/)
- [`ws-demo/`](./ws-demo/) — 라이브러리 없이 만든 WebSocket 서버. 프레임 바이트를 그대로 찍는다. 시험 15개
- [`demo.sh`](./demo.sh) — 장표 9·10·13·18·19 라이브 데모 (`accept`·`handshake`·`client`·`real`·`server`)

```bash
# 저장소 맨 위에서
python3 .claude/skills/study-pack/slides.py week-05/유진영/study-pack week-05/유진영
python3 .claude/skills/study-pack/build.py  week-05/유진영/study-pack week-05/유진영/flashcards.html
```

바이트 값과 헤더는 데모 서버와 `echo.websocket.org`에서 11/23에 찍은 실제 값입니다.

## 발표 전에 채울 것

- [ ] 장표 20 "우리 서비스에서는" 박스: 실시간으로 바뀌는 화면이 지금 폴링인지, 쓴다면 WebSocket과 SSE 중 무엇이 맞는지, 앞단 nginx·로드밸런서의 유휴 타임아웃
- [ ] 과제 D 데모용으로 `week-04/유진영/assignment-d`에서 `bash reproduce.sh` 한 번

## 지난주 과제 D

결과와 코드: [`week-04/유진영/assignment-d/`](../../week-04/유진영/assignment-d/)

## 과제 E. 실시간 알림판 (WebSocket 버전)

다음 회차까지. 내용은 루트 README의 5주차 항목. `ws-demo`가 출발점이다(방송·하트비트·close는 이미 있음).

- [ ] 서버에서 알림 발생(관리자 버튼이나 타이머) → 브라우저에 바로 뜨기
- [ ] 브라우저 → 서버 "읽음" 표시
- [ ] DevTools WS 화면과 1분 동안의 HTTP 요청 수·메시지 수를 README에 기록
