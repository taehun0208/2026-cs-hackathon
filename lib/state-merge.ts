import { missions, type LabState } from "./missions.ts";

// Compare values, not object insertion order or client wall clocks. A progress
// entry stays atomic so its code, execution evidence and reflection stay paired.
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.entries(a).filter(([, value]) => value !== undefined);
  const right = Object.entries(b).filter(([, value]) => value !== undefined);
  return (
    left.length === right.length &&
    left.every(([key, value]) =>
      sameValue(value, (b as Record<string, unknown>)[key]),
    )
  );
}

export function mergeStates(
  base: LabState,
  local: LabState,
  remote: LabState,
  preference: "local" | "remote" = "local",
) {
  const conflicts: string[] = [];
  function choose<T>(before: T, here: T, there: T, label: string): T {
    if (sameValue(here, before)) return there;
    if (sameValue(there, before) || sameValue(here, there)) return here;
    conflicts.push(label);
    return preference === "local" ? here : there;
  }
  const state: LabState = { version: 1, progress: {} };
  const profile = choose(
    base.profile,
    local.profile,
    remote.profile,
    "시작 설문",
  );
  if (profile) state.profile = profile;
  for (const mission of missions) {
    const id = mission.id;
    const progress = choose(
      base.progress[id],
      local.progress[id],
      remote.progress[id],
      `${mission.title} 코드 체험`,
    );
    if (progress) state.progress[id] = progress;
    const game = choose(
      base.games?.[id],
      local.games?.[id],
      remote.games?.[id],
      `${mission.title} 게임`,
    );
    if (game) (state.games ??= {})[id] = game;
  }
  return { state, conflicts };
}
