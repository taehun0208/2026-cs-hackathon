import { missions, type LabState, type TrackId } from "./missions.ts";

export type StateKey = "profile" | `progress.${TrackId}` | `games.${TrackId}`;
export function isStateKey(value: unknown): value is StateKey {
  return (
    value === "profile" ||
    missions.some(
      ({ id }) => value === `progress.${id}` || value === `games.${id}`,
    )
  );
}
export function changedStateKeys(
  before: LabState,
  after: LabState,
): StateKey[] {
  const keys: StateKey[] = [];
  if (!sameValue(before.profile, after.profile)) keys.push("profile");
  for (const { id } of missions) {
    if (!sameValue(before.progress[id], after.progress[id]))
      keys.push(`progress.${id}`);
    if (!sameValue(before.games?.[id], after.games?.[id]))
      keys.push(`games.${id}`);
  }
  return keys;
}

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
  forcedChanges: readonly StateKey[] = [],
) {
  const conflicts: string[] = [];
  function choose<T>(
    before: T,
    here: T,
    there: T,
    label: string,
    key: StateKey,
  ): T {
    if (sameValue(here, there)) return here;
    if (!forcedChanges.includes(key) && sameValue(here, before)) return there;
    if (sameValue(there, before)) return here;
    conflicts.push(label);
    return preference === "local" ? here : there;
  }
  const state: LabState = { version: 1, progress: {} };
  const profile = choose(
    base.profile,
    local.profile,
    remote.profile,
    "시작 설문",
    "profile",
  );
  if (profile) state.profile = profile;
  for (const mission of missions) {
    const id = mission.id;
    const progress = choose(
      base.progress[id],
      local.progress[id],
      remote.progress[id],
      `${mission.title} 코드 체험`,
      `progress.${id}`,
    );
    if (progress) state.progress[id] = progress;
    const game = choose(
      base.games?.[id],
      local.games?.[id],
      remote.games?.[id],
      `${mission.title} 게임`,
      `games.${id}`,
    );
    if (game) (state.games ??= {})[id] = game;
  }
  return { state, conflicts };
}
