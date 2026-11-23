export const people = ["민지", "준호"] as const;
export const serviceSteps = ["남은 자리 확인", "표 발급", "자리 차감"] as const;
export function backendState(turns: number[], recheck = false) {
  const progress = [0, 0],
    allowed = [false, false],
    tickets = [false, false];
  let seats = 1;
  for (const who of turns) {
    const step = progress[who]++;
    if (step === 0) allowed[who] = seats > 0;
    if (step === 1) tickets[who] = allowed[who] && (!recheck || seats > 0);
    if (step === 2 && tickets[who]) seats--;
  }
  return {
    progress,
    allowed,
    tickets,
    seats,
    busy: progress.findIndex((n) => n > 0 && n < 3),
  };
}
export function oversold(turns: number[]) {
  return backendState(turns).tickets.filter(Boolean).length > 1;
}
export type BackendFix = "lock" | "recheck" | "servers";
export const backendFixes: { id: BackendFix; label: string; note: string }[] = [
  {
    id: "lock",
    label: "한 사람의 처리가 끝날 때까지 다른 사람은 기다리게 하기",
    note: "확인부터 차감까지 한 덩어리로 묶어요.",
  },
  {
    id: "recheck",
    label: "표를 발급하기 직전에 남은 자리를 한 번 더 확인하기",
    note: "확인은 늘지만 차감은 여전히 나중에 해요.",
  },
  {
    id: "servers",
    label: "서버를 한 대 더 늘리기",
    note: "처리 속도는 빨라져도 처리 순서는 그대로예요.",
  },
];
// 사람마다 3단계를 순서대로 처리하는 모든 겹침 순서(6칸 중 3칸을 민지에게 배정).
export const allBackendOrders: number[][] = (() => {
  const out: number[][] = [];
  for (let bits = 0; bits < 64; bits++) {
    const turns = Array.from({ length: 6 }, (_, i) => (bits >> i) & 1);
    if (turns.filter((v) => v === 0).length === 3) out.push(turns);
  }
  return out;
})();
export function backendOutcome(turns: number[], fix: BackendFix) {
  if (fix === "lock") {
    const first = turns[0];
    return backendState([first, first, first, 1 - first, 1 - first, 1 - first]);
  }
  return backendState(turns, fix === "recheck");
}
export function countOversold(fix: BackendFix) {
  return allBackendOrders.filter(
    (turns) => backendOutcome(turns, fix).tickets.filter(Boolean).length > 1,
  ).length;
}

export type AccessUser = null | { id: string; role: "student" | "admin" };
// 코드 체험 보안 미션(authorizeRequest)과 같은 규칙.
export function authorize(
  user: AccessUser,
  ownerId: string,
  action: "read" | "delete",
) {
  if (!user) return 401;
  if (user.id === ownerId) return 200;
  if (user.role === "admin" && action === "read") return 200;
  return 403;
}

// 코드 체험 클라우드 미션(decideRelease)과 같은 기준.
export type ReleaseMetrics = {
  requests: number;
  errors: number;
  p95Ms: number;
};
export function decideRelease(m: ReleaseMetrics) {
  if (m.requests < 100) return "wait";
  if (m.errors / m.requests > 0.02 || m.p95Ms > 500) return "rollback";
  return "promote";
}

// [이름, 취소 여부] — 입장 기록 16건
export const visits: [string, boolean][] = [
  ["민지", false],
  ["준호", false],
  ["민지", false],
  ["서연", false],
  ["하준", true],
  ["준호", false],
  ["지우", false],
  ["민지", false],
  ["도윤", false],
  ["서연", false],
  ["하준", true],
  ["수아", false],
  ["지우", false],
  ["도윤", false],
  ["은우", true],
  ["수아", false],
];
export function countVisits(excludeCancelled: boolean, uniquePeople: boolean) {
  const rows = visits.filter(
    ([, cancelled]) => !excludeCancelled || !cancelled,
  );
  return uniquePeople ? new Set(rows.map(([name]) => name)).size : rows.length;
}

export const notices = [
  { title: "지난주 영화제", time: "오후 6시", place: "운동장" },
  { title: "이번 주 영화제", time: "오후 7시", place: "학생회관" },
  { title: "이번 주 음악회", time: "오후 5시", place: "강당" },
];
