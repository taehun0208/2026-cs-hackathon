import {
  authorize,
  countVisits,
  decideRelease,
  notices,
  type AccessUser,
  type ReleaseMetrics,
} from "./game-rules.ts";

export type Round = {
  facts: string[];
  question: string;
  options: string[];
  answer: number;
  why: string;
};

const verdicts = [
  "허용해요 (200)",
  "로그인이 필요해요 (401)",
  "권한이 없어요 (403)",
];
const verdictOf = (code: number) => verdicts[[200, 401, 403].indexOf(code)];
const mina: AccessUser = { id: "mina", role: "student" };
const jun: AccessUser = { id: "jun", role: "student" };
const admin: AccessUser = { id: "admin", role: "admin" };
const request = (
  who: string,
  user: AccessUser,
  owner: string,
  action: "read" | "delete",
  detail: string,
  why: string,
): Round => ({
  facts: [
    `요청한 사람: ${who}`,
    `대상: ${owner === "mina" ? "미나" : "준호"}의 신청 내역`,
    `하려는 일: ${action === "read" ? "조회" : "삭제"}`,
    detail,
  ],
  question: "이 요청을 어떻게 처리할까요?",
  options: verdicts,
  answer: verdicts.indexOf(verdictOf(authorize(user, owner, action))),
  why,
});
export const securityRounds: Round[] = [
  request(
    "로그인하지 않은 방문자",
    null,
    "mina",
    "read",
    "주소: /applications/mina-1",
    "누구인지 모르면 내용을 보여주기 전에 로그인부터 요구해요.",
  ),
  request(
    "미나(학생)",
    mina,
    "mina",
    "delete",
    "주소: /applications/mina-1",
    "자기 신청 내역은 직접 조회하고 삭제할 수 있어요.",
  ),
  request(
    "준호(학생)",
    jun,
    "mina",
    "read",
    "주소의 신청 번호만 mina-1로 바꿔 입력했어요.",
    "로그인했다고 모두 볼 수 있는 건 아니에요. 서버가 매 요청마다 소유자를 확인해야 해요.",
  ),
  request(
    "관리자",
    admin,
    "mina",
    "read",
    "주소: /applications/mina-1 · 운영 점검",
    "관리자는 운영을 위해 다른 사람의 내역을 볼 수 있어요.",
  ),
  request(
    "관리자",
    admin,
    "mina",
    "delete",
    "주소: /applications/mina-1 · 정리 작업",
    "관리자라도 다른 사람의 기록을 지울 수는 없어요. 볼 수 있는 것과 지울 수 있는 것은 달라요.",
  ),
  request(
    "준호(학생)",
    jun,
    "jun",
    "read",
    "주소: /applications/jun-1",
    "소유자 본인이면 문제없이 허용해요. 막아야 할 것만 막는 것도 중요해요.",
  ),
];

const waitLabels = [
  "더 지켜봐요 (wait)",
  "이전 버전으로 되돌려요 (rollback)",
  "더 많은 사용자에게 공개해요 (promote)",
];
const decisions = ["wait", "rollback", "promote"];
const release = (m: ReleaseMetrics, why: string): Round => ({
  facts: [
    `관측한 요청 ${m.requests}건`,
    `오류 ${m.errors}건 (${((m.errors / m.requests) * 100).toFixed(1)}%)`,
    `p95 응답 시간 ${m.p95Ms}ms`,
    "새 버전을 일부 사용자에게만 먼저 공개한 상태예요.",
  ],
  question: "새 버전을 어떻게 할까요?",
  options: waitLabels,
  answer: decisions.indexOf(decideRelease(m)),
  why,
});
export const cloudRounds: Round[] = [
  release(
    { requests: 40, errors: 5, p95Ms: 300 },
    "오류율이 높아 보여도 요청이 100건 미만이면 아직 판단하기 일러요. 데이터가 더 쌓일 때까지 지켜봐요.",
  ),
  release(
    { requests: 500, errors: 15, p95Ms: 320 },
    "충분히 관측했고 오류율이 3%로 기준 2%를 넘었어요. 응답이 빨라도 되돌려야 해요.",
  ),
  release(
    { requests: 800, errors: 8, p95Ms: 640 },
    "오류는 1%로 괜찮지만 p95 응답 시간이 500ms를 넘었어요. 둘 중 하나만 어겨도 되돌려요.",
  ),
  release(
    { requests: 1000, errors: 6, p95Ms: 280 },
    "충분히 관측했고 오류율 0.6%, 응답 시간 280ms로 두 기준을 모두 지켰어요. 계속 진행해도 좋아요.",
  ),
];

const grounds = [
  "근거에 맞는 답이에요",
  "근거가 다른 주의 공지예요",
  "근거에 없는 내용을 지어냈어요",
];
const [lastWeek, thisWeek] = notices;
const bot = (
  question: string,
  doc: string,
  answer: string,
  pick: number,
  why: string,
): Round => ({
  facts: [
    `사용자 질문: “${question}”`,
    `봇이 찾은 공지: ${doc}`,
    `봇의 답변: “${answer}”`,
  ],
  question: "이 답변을 어떻게 채점할까요?",
  options: grounds,
  answer: pick,
  why,
});
export const aiRounds: Round[] = [
  bot(
    "이번 주 영화제는 언제 어디서 해?",
    `${thisWeek.title} · ${thisWeek.time} · ${thisWeek.place}`,
    `${thisWeek.time}에 ${thisWeek.place}에서 열려요.`,
    0,
    "질문의 주차와 행사가 공지와 같고, 답변도 공지에 적힌 그대로예요.",
  ),
  bot(
    "이번 주 영화제 장소가 어디야?",
    `${lastWeek.title} · ${lastWeek.time} · ${lastWeek.place}`,
    `${lastWeek.place}에서 열려요.`,
    1,
    "행사 이름은 같지만 지난주 공지예요. 주차까지 맞는 문서를 찾았는지 확인해야 해요.",
  ),
  bot(
    "영화제 때 주차할 수 있어?",
    `${thisWeek.title} · ${thisWeek.time} · ${thisWeek.place}`,
    "학생회관 주차장을 무료로 쓸 수 있어요.",
    2,
    "공지에는 주차 안내가 없어요. 문서에 없는 내용을 그럴듯하게 말한 거예요.",
  ),
  bot(
    "영화제 때 주차할 수 있어?",
    `${thisWeek.title} · ${thisWeek.time} · ${thisWeek.place}`,
    "공지에는 주차 안내가 없어요. 담당자에게 확인해 주세요.",
    0,
    "근거가 없을 때 모른다고 말하는 것도 근거에 맞는 좋은 답이에요.",
  ),
];

const dataRound = (
  question: string,
  options: string[],
  value: number,
  unit: string,
  why: string,
): Round => ({
  facts: ["위 입장 기록 16건을 보고 답해요."],
  question,
  options,
  answer: options.indexOf(`${value}${unit}`),
  why,
});
export const dataRounds: Round[] = [
  dataRound(
    "오늘 행사에 실제로 온 사람은 몇 명일까요?",
    ["6명", "8명", "13명", "16명"],
    countVisits(true, true),
    "명",
    "취소한 기록은 오지 않은 사람이고, 한 사람이 여러 번 들어와도 한 명이에요. 두 규칙을 모두 켜면 나와요.",
  ),
  dataRound(
    "출입 게이트를 실제로 지나간 횟수는 몇 번일까요?",
    ["6회", "8회", "13회", "16회"],
    countVisits(true, false),
    "회",
    "게이트 부하를 볼 때는 사람이 아니라 통과 횟수가 필요해요. 재입장도 세지만 취소 기록은 빼요.",
  ),
  dataRound(
    "한 번 들어왔다가 다시 들어온 재입장은 몇 번일까요?",
    ["3회", "7회", "10회", "13회"],
    countVisits(true, false) - countVisits(true, true),
    "회",
    "통과 횟수 13회에서 실제 사람 수 6명을 빼면 7회예요. 같은 기록도 질문에 따라 세는 기준이 달라져요.",
  ),
];

// 보기 위치를 섞어요. 정답 위치를 외워서 맞히지 못하도록 시작할 때마다 새로 섞어요.
export function shuffleOrder(length: number, random = Math.random) {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// 프론트엔드: 4가지 상황을 모두 통과한 뒤, 고친 설정이 왜 필요했는지 묻는 확인 질문이에요.
const why = (
  setting: string,
  question: string,
  options: string[],
  explanation: string,
): Round => ({
  facts: [`방금 고른 설정: ${setting}`],
  question,
  options,
  answer: 0,
  why: explanation,
});
export const frontendRounds: Round[] = [
  why(
    "글자 줄바꿈 허용",
    "글자 줄바꿈을 허용해야 했던 이유는 무엇일까요?",
    [
      "큰 글자나 긴 이름은 한 줄에 다 들어가지 않을 수 있어서",
      "줄바꿈이 있어야 글자가 더 예뻐 보여서",
      "한 줄로 두는 것이 항상 읽기 어려워서",
    ],
    "화면 크기, 글자 크기, 이름 길이는 사용자마다 달라요. 한 줄만 고집하면 넘치는 상황이 생겨서 줄을 바꿔도 되게 열어 둬야 해요.",
  ),
  why(
    "버튼 너비를 칸 너비에 맞춤",
    "버튼 너비를 160px로 고정했을 때 어떤 일이 생겼나요?",
    [
      "칸이 160px보다 좁은 상황에서 버튼이 칸 밖으로 넘쳤어요",
      "글자가 작은 상황에서 버튼이 너무 커졌어요",
      "칸이 넓은 상황에서 글자가 잘렸어요",
    ],
    "고정한 길이는 칸이 그보다 좁아지면 맞지 않아요. 칸에 맞추면 칸이 달라져도 버튼이 따라와요.",
  ),
  why(
    "버튼 높이를 내용에 맞춤",
    "줄바꿈을 허용해도 높이를 32px로 고정하면 왜 잘릴까요?",
    [
      "줄이 두 줄 이상이 되면 글자가 32px 안에 다 들어가지 않아서",
      "높이는 글자가 보이는 것과 관계가 없어서",
      "줄바꿈을 하면 글자가 저절로 작아져서",
    ],
    "줄이 늘어나면 필요한 높이도 늘어나요. 높이를 내용에 맞추면 몇 줄이 되어도 글자가 다 보여요.",
  ),
];
