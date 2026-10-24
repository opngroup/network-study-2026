# week01 · 포트와 NAT

## 발표 자료

- [슬라이드 (Marp)](./slides.md) — 출발지 포트 → 4-튜플 → NAT·NAPT → conntrack
- [슬라이드 HTML](./slides.html) — 그림까지 들어 있는 파일 하나. 내려받아 브라우저로 연다
- 그림: [공유기 구조](./nat-home.svg) · [NAPT 왕복](./napt-flow.svg)
- 학습 메모: [study.md](./study.md)
- NAPT 직접 확인: `bash napt-check.sh` — 내가 쓴 출발지와 서버가 본 출발지를 나란히 찍는다

## 과제 A. TCP 에코 서버 (10/26 데모)

진행 중이다(10/24). 결과는 [assignment-a/README.md](./assignment-a/README.md), 단계별로 이해한 것은 [assignment-a/NOTES.md](./assignment-a/NOTES.md).

- [ ] 접속한 클라이언트의 IP·포트를 로그로 남기고, 3개를 동시에 붙였을 때 포트가 각각 다른 것 확인
- [ ] 127.0.0.1 과 0.0.0.0 으로 바인딩해 다른 기기(휴대폰이나 Docker 밖)에서 접속되는지 비교
