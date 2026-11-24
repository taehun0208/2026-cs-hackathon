<div align="center">
  <img src="./public/favicon.svg" width="64" alt="COMPFit" />
  <h1>COMPFit</h1>
  <p><strong>컴퓨터 직무, 해보고 맞는지 가늠하기</strong></p>
  <p>작은 업무를 직접 해보고,<br />나에게 흥미로운 직무와 다음 학습을 찾아가는 서비스입니다.</p>
  <p>2026 컴학 해커톤</p>
  <p>
    <a href="https://haebogi-career-lab.vercel.app"><strong>COMPFit 시작하기 ↗</strong></a>
    &nbsp;·&nbsp;
    <a href="./docs/PRD-v0.2.md">서비스 기획</a>
    &nbsp;·&nbsp;
    <a href="./docs/TEAM-DEVELOPMENT.md">개발 가이드</a>
  </p>
</div>

---

## 💡 왜 만들었나

직무 이름은 알지만 실제로 어떤 일을 하는지, 어떤 과정이 재미있는지는 경험하기 전까지 알기 어렵습니다.
COMPFit은 **컴퓨터학부 학생이 여섯 직무의 작은 업무를 체험하고, 자신의 경험을 근거로 다음에 배울 것을 고르도록** 돕습니다.

**직무 선택 → 코드·게임 체험 → 회고·비교 → 다음 학습 선택**

## 💻 핵심 기능

| 기능            | 할 수 있는 일                                                                    |
| --------------- | -------------------------------------------------------------------------------- |
| **직무 맛보기** | 준비된 코드의 한 줄을 바꾸거나, 코드 없는 게임으로 업무를 경험합니다.            |
| **AI 코치**     | 막힌 부분을 질문하면 과제와 실행 기록을 참고한 힌트·근거·다음 행동을 확인합니다. |
| **회고와 비교** | 흥미·어려움·재도전 의향을 기록하고, 두 개 이상의 완료한 코드 체험을 비교합니다.  |
| **이어하기**    | 진행 내용을 자동 저장하고, 다음에 다시 열어 이어갑니다.                          |

### 체험할 수 있는 직무

| 직무           | 작은 업무                                  |
| -------------- | ------------------------------------------ |
| 프론트엔드     | 행사 목록 필터링 · 화면에 맞는 버튼 만들기 |
| 백엔드         | 신청 조건 처리 · 표 중복 발급 막기         |
| 데이터 분석    | 취소·중복 정리 · 참여율 집계               |
| AI 엔지니어    | 근거 문서 검색 · 봇 답변 판단              |
| 보안 엔지니어  | 로그인·소유권에 따른 접근 권한 판단        |
| 클라우드 / SRE | 오류율·지연 시간을 보고 배포 판단          |

## 🧠 Agentic AI

AI 코치는 `read_mission`과 `inspect_checks` 도구로 과제 요구사항과 실행 보고를 확인합니다.
모델이 질문 의도를 분류하면 **서버가 검수된 힌트와 근거를 확인해 표시**하며, 실제 도구 활동을 화면에 보여줍니다.

AI 이용은 선택 동의 후 시작하며, 응답 지연이나 연결 문제가 있으면 기본 힌트로 이어갑니다.
자세한 동작과 검증 범위는 [AI 품질 문서](./docs/AI-QUALITY.md)에 정리했습니다.

## 🧱 기술 스택

| 영역           | 사용 기술                                         |
| -------------- | ------------------------------------------------- |
| Frontend / API | Next.js 16 · React 19 · TypeScript · Tailwind CSS |
| AI             | OpenAI API · 도구 호출 · 검수 힌트 선택           |
| Data           | Neon PostgreSQL · 로컬 SQLite                     |
| 실행·배포      | iframe + Web Worker · Vercel · GitHub Actions     |

## 🚀 로컬 실행

Node.js 24 환경에서 실행합니다.

```sh
git clone https://github.com/taehun0208/2026-cs-hackathon.git
cd 2026-cs-hackathon
npm ci
npm run dev
```

[localhost:3000](http://127.0.0.1:3000)에서 확인할 수 있습니다. 키 없이도 로컬 저장과 기본 힌트로 체험할 수 있습니다.
실제 AI·DB 연결과 배포 방법은 [개발 가이드](./docs/TEAM-DEVELOPMENT.md)를 참고하세요.

## 📚 문서·발표

- [서비스 기획서](./docs/PRD-v0.2.md) · [현재 구현 범위](./docs/IMPLEMENTATION.md)
- [개발·배포 가이드](./docs/TEAM-DEVELOPMENT.md) · [디자인 결정](./docs/DESIGN.md)
- [5분 발표 PPTX](./deliverables/demo/five-minute/haebogi-5min-team.pptx) · [발표 PDF](./deliverables/demo/five-minute/haebogi-5min-team.pdf)
