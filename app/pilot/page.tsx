import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { pilotAssignments, trackNames } from "../../lib/pilot-plan";
export const metadata = { title: "학생 파일럿 안내 | 해보기" };
export default function Pilot() {
  return (
    <main className="wrap pilot-page">
      <Link className="back-link" href="/">
        <ChevronLeft size={17} aria-hidden="true" /> 체험실로
      </Link>
      <header className="pilot-intro">
        <h1>학생 파일럿 안내</h1>
        <p>두 직무를 직접 해보고, 느낀 점과 다음에 해볼 일을 남겨요.</p>
        <p className="pilot-meta">
          약 35~45분 예상 · 언제든 쉬거나 그만둘 수 있어요.
        </p>
      </header>
      <section aria-labelledby="pilot-before-heading">
        <h2 id="pilot-before-heading">시작 전에</h2>
        <ol>
          <li>
            안내자에게 참여 번호를 받아요. 이름·학번·연락처는 코드나 회고에 적지
            마세요.
          </li>
          <li>사전 질문과 경험 수준을 안내자의 양식에 남겨요.</li>
          <li>
            활동 기록 수집에 참여하려면 도움말의 ‘체험 개선 참여’에서 번호를
            고른 뒤 켜주세요. 참여하지 않아도 체험과 관찰을 진행할 수 있어요.
          </li>
        </ol>
      </section>
      <section aria-labelledby="pilot-steps-heading">
        <h2 id="pilot-steps-heading">진행 순서</h2>
        <ol className="pilot-steps">
          <li>
            <strong>첫 번째 직무 해보기</strong>
            <p>
              아래에 배정된 직무를 약 10분 체험해요. 문법 예제·힌트·참고 풀이를
              자유롭게 이용해도 돼요.
            </p>
            <p>
              테스트를 다 통과하지 않아도 코드를 수정·실행했다면 회고와 다음
              활동을 남길 수 있어요.
            </p>
          </li>
          <li>
            <strong>두 번째 직무와 비교하기</strong>
            <p>
              다음 직무를 체험하고 회고를 남긴 뒤 ‘비교하기’에서 흥미와 어려움을
              나란히 살펴봐요.
            </p>
          </li>
          <li>
            <strong>느낀 점 나누기</strong>
            <p>
              사전과 같은 명확성 질문에 답하고, 선택한 다음 활동과 이유를
              안내자에게 설명해요. 원하면 게임 하나도 해봐요. 게임과 코드 체험
              결과는 따로 기록해요.
            </p>
          </li>
        </ol>
        <div className="pilot-question">
          <strong>다음에 무엇을 배울지 얼마나 분명한가요?</strong>
          <p>사전·사후 같은 질문에 1~5점으로 답해요.</p>
          <p>1 전혀 분명하지 않다 — 5 매우 분명하다</p>
        </div>
      </section>
      <section aria-labelledby="pilot-assignments-heading">
        <h2 id="pilot-assignments-heading">내가 해볼 직무</h2>
        <p>안내받은 참여 번호를 찾아 순서대로 체험해주세요.</p>
        <div className="pilot-table">
          <table>
            <caption className="sr-only">
              참여 번호별 코드 직무 체험 순서
            </caption>
            <thead>
              <tr>
                <th scope="col">참여 번호</th>
                <th scope="col">첫 번째</th>
                <th scope="col">두 번째</th>
              </tr>
            </thead>
            <tbody>
              {pilotAssignments.map((p) => (
                <tr key={p.participantCode}>
                  <th scope="row">{p.participantCode}</th>
                  <td>{trackNames[p.first]}</td>
                  <td>{trackNames[p.second]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="pilot-followup-heading">
        <h2 id="pilot-followup-heading">7일 뒤, 시작한 일 확인하기</h2>
        <p>
          후속 연락에 동의한 경우에만 안내자가 연락해요. 선택한 활동을 실제로
          시작했는지, 어떤 일을 했는지 알려주세요. 시작하지 못했거나 체험을
          중간에 그만뒀어도 편하게 답해주세요.
        </p>
      </section>
      <section aria-labelledby="pilot-downloads-heading">
        <h2 id="pilot-downloads-heading">진행자용 기록 양식</h2>
        <p>
          아래 파일은 비어 있는 기록 양식이에요. 작성한 파일과 연락처는 공개
          저장소에 올리지 마세요.
        </p>
        <ul className="pilot-downloads">
          <li>
            <a href="/pilot-kit/protocol.md" download>
              진행 순서·질문·지표 정의
              <Download size={18} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a href="/pilot-kit/participants.csv" download>
              배정·사전·사후 응답 양식
              <Download size={18} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a href="/pilot-kit/observations.csv" download>
              직무별 관찰 양식
              <Download size={18} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a href="/pilot-kit/followup.csv" download>
              7일 뒤 확인 양식
              <Download size={18} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>
      <Link className="btn primary" href="/">
        체험실로 가기
      </Link>
    </main>
  );
}
