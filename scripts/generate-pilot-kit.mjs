import fs from "node:fs";
import { pilotAssignments, trackNames } from "../lib/pilot-plan.ts";
const directory = new URL("../public/pilot-kit/", import.meta.url);
fs.mkdirSync(directory, { recursive: true });
const write = (name, headers, rows) => {
  const cell = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
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
    "관찰동의",
    "분석동의",
    "JS경험",
    "AI도구경험",
    "사전명확성1_5",
    "사후명확성1_5",
    "두직무회고완료",
    "다음활동선택",
    "선택이유설명가능",
    "후속연락동의",
    "실시일",
    "진행상태",
  ],
  pilotAssignments.map((p) => [
    p.participantCode,
    trackNames[p.first],
    trackNames[p.second],
    ...Array(12).fill(""),
  ]),
);
write(
  "observations.csv",
  [
    "참여번호",
    "직무",
    "순서",
    "시작시각",
    "첫수정까지초",
    "첫실행까지초",
    "힌트사용",
    "풀이사용",
    "회고제출",
    "서버저장확인",
    "중단지점",
    "개념직접설명여부",
    "진행자개입",
    "관찰메모",
  ],
  pilotAssignments.flatMap((p) =>
    [p.first, p.second].map((track, i) => [
      p.participantCode,
      trackNames[track],
      i + 1,
      ...Array(11).fill(""),
    ]),
  ),
);
write(
  "followup.csv",
  [
    "참여번호",
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
  pilotAssignments.map((p) => [p.participantCode, ...Array(9).fill("")]),
);
console.log(
  "Prepared blank 12-participant, 24-observation and 12-follow-up templates; no responses generated.",
);
