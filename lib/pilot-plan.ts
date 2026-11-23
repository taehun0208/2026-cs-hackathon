import type { TrackId } from "./missions.ts";
export const trackNames: Record<TrackId, string> = {
  frontend: "프론트엔드",
  backend: "백엔드",
  data: "데이터 분석",
  ai: "AI 엔지니어",
  security: "보안 엔지니어",
  cloud: "클라우드 / SRE",
};
const cycle: TrackId[] = [
  "frontend",
  "backend",
  "data",
  "ai",
  "security",
  "cloud",
];
export const pilotAssignments = Array.from({ length: 12 }, (_, i) => {
  const n = i % 6,
    a = cycle[n],
    b = cycle[(n + 1) % 6];
  return {
    participantCode: `P${String(i + 1).padStart(2, "0")}`,
    first: i < 6 ? a : b,
    second: i < 6 ? b : a,
  };
});

// A small usability check, kept separate from the later 12-person pilot.
export const prepilotAssignments = [
  { participantCode: "S01", first: "frontend", second: "backend" },
  { participantCode: "S02", first: "data", second: "ai" },
  { participantCode: "S03", first: "security", second: "cloud" },
] as const satisfies readonly {
  participantCode: string;
  first: TrackId;
  second: TrackId;
}[];
