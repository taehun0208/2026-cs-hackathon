import Link from "next/link";
import { pilotAssignments, trackNames } from "../../lib/pilot-plan";
export const metadata = { title: "학생 파일럿 안내 | 해보기" };
export default function Pilot() {
  return (
    <main className="wrap pilot-page">
      <Link href="/">← 체험실</Link>
      <h1>학생 파일럿 진행 안내</h1>
      <p>
        두 직무를 직접 고쳐보고, 다음에 배우고 싶은 일이 더 분명해졌는지
        확인해요. 약 35~45분을 예상하며 언제든 쉬거나 그만둘 수 있어요.
      </p>
      <section>
        <h2>시작 전에</h2>
        <ol>
          <li>
            안내자에게 참여 번호를 받아요. 이름·학번·연락처는 체험이나 코드에
            적지 않아요.
          </li>
          <li>사전 질문의 1~5점과 경험 수준을 안내자 양식에 남겨요.</li>
          <li>
            도움말의 ‘체험 개선 참여’에서 번호를 고르고, 원한다면 활동 기록
            참여를 켜요. 꺼도 체험과 관찰 참여는 가능해요.
          </li>
        </ol>
      </section>
      <section>
        <h2>해볼 순서</h2>
        <ol>
          <li>
            아래에 배정된 첫 직무를 약 10분 체험해요. 막히면 문법 예제·힌트·참고
            풀이를 자유롭게 써요.
          </li>
          <li>
            다 통과하지 못해도 코드를 수정·실행했다면 회고와 다음 활동을 남겨요.
          </li>
          <li>두 번째 직무를 체험하고 ‘비교하기’를 열어요.</li>
          <li>
            같은 명확성 질문에 다시 답하고, 선택한 다음 활동과 이유를 안내자에게
            설명해요.
          </li>
          <li>
            원하면 게임 하나도 해봐요. 게임 결과는 코드 체험 기록과 구분해요.
          </li>
        </ol>
        <p>
          명확성 질문: “다음에 무엇을 배울지 얼마나 분명한가요?” 1점 전혀
          분명하지 않다 ~ 5점 매우 분명하다.
        </p>
      </section>
      <section>
        <h2>참여 번호별 직무</h2>
        <div className="pilot-table">
          <table>
            <thead>
              <tr>
                <th>번호</th>
                <th>첫 번째</th>
                <th>두 번째</th>
              </tr>
            </thead>
            <tbody>
              {pilotAssignments.map((p) => (
                <tr key={p.participantCode}>
                  <td>{p.participantCode}</td>
                  <td>{trackNames[p.first]}</td>
                  <td>{trackNames[p.second]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>7일 뒤</h2>
        <p>
          선택한 활동을 실제로 시작했는지, 시작했다면 어떤 일을 했는지
          안내자에게 알려주세요. 시작하지 못했거나 중간에 그만둔 경우도 도움이
          되는 응답이에요. 후속 연락에 동의한 경우에만 안내자가 별도로 연락해요.
        </p>
      </section>
      <section>
        <h2>진행자 준비물</h2>
        <p>
          아래 파일은 비어 있는 기록 양식이에요. 작성한 파일과 연락처는 공개
          저장소에 올리지 마세요.
        </p>
        <ul>
          <li>
            <a href="/pilot-kit/protocol.md" download>
              진행 순서·질문·지표 정의
            </a>
          </li>
          <li>
            <a href="/pilot-kit/participants.csv" download>
              배정·사전·사후 응답 양식
            </a>
          </li>
          <li>
            <a href="/pilot-kit/observations.csv" download>
              직무별 관찰 양식
            </a>
          </li>
          <li>
            <a href="/pilot-kit/followup.csv" download>
              7일 뒤 확인 양식
            </a>
          </li>
        </ul>
      </section>
      <Link className="btn primary" href="/">
        코드 체험 시작하기
      </Link>
    </main>
  );
}
