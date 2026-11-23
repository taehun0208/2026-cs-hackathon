import fs from "node:fs";
import { prepilotAssignments, trackNames } from "../lib/pilot-plan.ts";
const directory = new URL("../public/prepilot-kit/", import.meta.url);
fs.mkdirSync(directory, { recursive: true });
const write = (name, headers, rows) => {
  const cell = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
  fs.writeFileSync(
    new URL(name, directory),
    "\uFEFF" +
      [headers, ...rows].map((row) => row.map(cell).join(",")).join("\n") +
      "\n",
  );
};
write(
  "participants.csv",
  [
    "참여번호",
    "첫직무",
    "둘째직무",
    "실시일",
    "배포버전",
    "기기_브라우저",
    "관찰동의",
    "분석동의",
    "JS경험",
    "AI도구경험",
    "직무알아본방식",
    "사전명확성1_5",
    "사후명확성1_5",
    "두직무회고저장",
    "다음활동선택",
    "선택이유설명가능",
    "직무업무이해변화_있음없음미응답",
    "도움뒤다음수정파악_예아니오미응답해당없음",
    "후속연락동의",
    "진행상태",
  ],
  prepilotAssignments.map((p) => [
    p.participantCode,
    trackNames[p.first],
    trackNames[p.second],
    ...Array(17).fill(""),
  ]),
);
write(
  "observations.csv",
  [
    "참여번호",
    "직무",
    "순서",
    "시작시각",
    "첫행동분류",
    "첫수정까지초",
    "첫실행까지초",
    "힌트사용",
    "풀이사용",
    "진행자개입0_3",
    "회고제출",
    "서버저장확인",
    "중단지점",
    "직무업무직접설명여부",
    "문제분류",
    "관찰메모",
  ],
  prepilotAssignments.flatMap((p) =>
    [p.first, p.second].map((track, i) => [
      p.participantCode,
      trackNames[track],
      i + 1,
      ...Array(13).fill(""),
    ]),
  ),
);
write(
  "followup.csv",
  [
    "참여번호",
    "후속연락동의",
    "확인예정일",
    "확인일",
    "응답상태",
    "시작여부",
    "활동종류",
    "미시작이유분류",
    "자기응답외확인여부",
    "다음계획",
    "메모",
  ],
  prepilotAssignments.map((p) => [p.participantCode, ...Array(10).fill("")]),
);
write(
  "findings.csv",
  [
    "문제번호",
    "관련참여번호",
    "화면_단계",
    "관찰된문제요약",
    "영향분류",
    "발생인원",
    "유효관찰인원",
    "재현방법",
    "개선가설",
    "담당",
    "후속이슈",
    "검증상태",
  ],
  [],
);
console.log(
  "Prepared blank 3-participant, 6-observation, 3-follow-up and findings templates; no responses generated.",
);
