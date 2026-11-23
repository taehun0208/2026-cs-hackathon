"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  LayoutTemplate,
  Braces,
  ChartNoAxesCombined,
  Play,
  Check,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Code2,
  Lightbulb,
  RotateCcw,
  CheckCircle2,
  Download,
  Trash2,
  X,
  CheckCheck,
  Monitor,
  HelpCircle,
  MessageCircle,
  LoaderCircle,
  Cloud,
  CloudOff,
  Search,
  FolderOpen,
  BrainCircuit,
  ShieldCheck,
  Server,
} from "lucide-react";
import {
  missions,
  events as originalEvents,
  canStartMission,
  emptyState,
  initialProgress,
  missionById,
  type LabState,
  type TrackId,
  type Progress,
  type Profile,
  type Reflection,
} from "../lib/missions";
import { missionForProgress } from "../lib/mission-catalog";
import { runMission } from "../lib/runner";
import { describeResult, describeInput } from "../lib/check-explanation";
import {
  canRecordAttempt,
  changeCode,
  currentExecution,
  isCompleted,
  normalizeProfile,
  profileAnswer,
  profileAnswerLabel,
  recordStatus,
  snapshotExecution,
  updateProfileAnswer,
} from "../lib/lab-state";
import {
  nextActionSuggestion,
  recommendationContext,
  makeNextActionPlan,
  representativeTracks,
} from "../lib/next-actions";
import { AnalyticsSettings, useAnalytics } from "./analytics-settings";
import { requestCoach } from "../lib/coach-request";
import { activityHref, selectedActivity } from "../lib/activities";
import { DeadlineExceeded } from "../lib/async-deadline";
import {
  createPersistence,
  isRecordReset,
  hasWork,
  type SaveStatus,
} from "../lib/persistence";

type View = "home" | "work" | "journal" | "compare" | "guide";
type HistoryMode = "push" | "replace";
const icons = {
  frontend: LayoutTemplate,
  backend: Braces,
  data: ChartNoAxesCombined,
  ai: BrainCircuit,
  security: ShieldCheck,
  cloud: Server,
};
const groups = [
  ["all", "전체"],
  ["build", "서비스 만들기"],
  ["insight", "AI · 데이터"],
  ["ops", "안전한 운영"],
] as const;
const trackGroup: Record<TrackId, string> = {
  frontend: "build",
  backend: "build",
  data: "insight",
  ai: "insight",
  security: "ops",
  cloud: "ops",
};
const taskLabels: Record<TrackId, { title: string; description: string }> = {
  frontend: {
    title: "행사 목록 필터 만들기",
    description: "선택한 카테고리에 맞게 화면을 바꿔요.",
  },
  backend: {
    title: "신청 조건 확인하기",
    description: "중복 신청과 남은 정원을 확인해요.",
  },
  data: {
    title: "행사 참여율 집계하기",
    description: "중복·취소를 정리하고 참여율을 구해요.",
  },
  ai: {
    title: "AI 참고 문서 고르기",
    description: "질문과 관련 있는 근거를 찾아요.",
  },
  security: {
    title: "접근 권한 확인하기",
    description: "내 정보와 다른 사람의 정보를 구분해요.",
  },
  cloud: {
    title: "배포 여부 판단하기",
    description: "오류율과 응답 속도로 배포를 결정해요.",
  },
};
function TrackIcon({ id, size = 22 }: { id: TrackId; size?: number }) {
  const Icon = icons[id];
  return (
    <Icon size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" />
  );
}
function Rating({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  low: string;
  high: string;
}) {
  return (
    <fieldset className="rating">
      <legend>{label}</legend>
      <div className="rating-buttons">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            aria-label={`${label} ${n}점`}
            aria-pressed={value === n}
            className={value === n ? "selected" : ""}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="rating-labels">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}
function ProfileQuestions({
  profile,
  onAnswer,
}: {
  profile: Profile | undefined;
  onAnswer: (field: "experience" | "purpose", value: string) => void;
}) {
  return (
    <details className="profile-questions">
      <summary>체험 전 경험 (선택)</summary>
      <p>선택하지 않아도 체험을 기록할 수 있어요.</p>
      <label className="form-label">
        JavaScript 경험 (선택)
        <select
          value={profileAnswer(profile, "experience") ?? ""}
          onChange={(e) => onAnswer("experience", e.target.value)}
        >
          <option value="">미응답</option>
          <option>아직 처음이에요</option>
          <option>기초 문법을 배웠어요</option>
          <option>작은 프로젝트를 해봤어요</option>
        </select>
      </label>
      <label className="form-label">
        탐색 목적 (선택)
        <select
          value={profileAnswer(profile, "purpose") ?? ""}
          onChange={(e) => onAnswer("purpose", e.target.value)}
        >
          <option value="">미응답</option>
          <option>어떤 분야가 재미있는지 알고 싶어요</option>
          <option>팀 프로젝트에서 맡을 역할을 고르고 싶어요</option>
          <option>다음에 공부할 주제를 찾고 싶어요</option>
        </select>
      </label>
    </details>
  );
}
export default function Lab({
  initialTrack,
  initialView,
}: {
  initialTrack?: TrackId;
  initialView?: "journal" | "compare" | "guide";
}) {
  const entryHandled = useRef("");
  const [locationVersion, setLocationVersion] = useState(0);
  const [view, setView] = useState<View>("home"),
    [state, setState] = useState<LabState>(emptyState),
    [notice, setNotice] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    phase: "loading",
    ready: false,
    localSaved: false,
    savedAt: null,
    expiresAt: null,
    message: "",
  });
  const analytics = useAnalytics(saveStatus.phase !== "loading");
  const persistence = useRef<ReturnType<typeof createPersistence> | null>(null);
  const executionEpoch = useRef(0);
  const editor = useRef<HTMLTextAreaElement | null>(null);
  // Resolve the existing consent before a direct link starts its journey.
  // A failed consent lookup still permits play, with collection disabled.
  const ready = saveStatus.ready && analytics.status.phase !== "loading";
  const deleting = saveStatus.phase === "deleting";
  const saveLabel = {
    loading: "불러오는 중",
    idle: "새 체험",
    saving: "저장 중",
    saved: "저장됨",
    error: "저장 실패",
    recovery: "초안 확인",
    conflict: "기록 확인 필요",
    deleting: "삭제 중",
  }[saveStatus.phase];
  const formatTime = (value: string) =>
    new Date(value).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const [active, setActive] = useState<TrackId>("frontend"),
    [modal, setModal] = useState<
      "reflection" | "reset" | "delete" | "solution" | null
    >(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [running, setRunning] = useState(false),
    [tab, setTab] = useState<"preview" | "tests" | "data">("preview"),
    [category, setCategory] = useState("개발"),
    [availableOnly, setAvailableOnly] = useState(true);
  const [group, setGroup] = useState("all"),
    [coachTrace, setCoachTrace] = useState<string[]>([]),
    [coachReferences, setCoachReferences] = useState<
      { id: string; label: string }[]
    >([]),
    [coachAction, setCoachAction] = useState(""),
    [hint, setHint] = useState(""),
    [hintSource, setHintSource] = useState(""),
    [question, setQuestion] = useState(""),
    [asking, setAsking] = useState(false);
  const [reflection, setReflection] = useState({
    interest: 0,
    difficulty: 0,
    again: 0,
    note: "",
    next: "",
  });
  const [selectedNextId, setSelectedNextId] = useState("");
  const [nextReason, setNextReason] = useState("");
  const latest = useRef(state),
    coachEpoch = useRef(0),
    coachController = useRef<AbortController | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = state;
  const pinned = state.progress[active];
  const sessionMission = pinned
    ? missionForProgress(active, pinned)
    : missionById(active);
  const unavailableContent = !sessionMission;
  const mission = sessionMission ?? missions.find((m) => m.id === active)!,
    storedProgress = state.progress[active] ?? initialProgress(mission),
    progress = {
      ...storedProgress,
      result: currentExecution(storedProgress)?.result,
    };
  const events = mission.previewArgs[0] as typeof originalEvents;
  const nextContext = recommendationContext(state, active, reflection);
  const nextSuggestion = nextActionSuggestion(reflection, active, nextContext);
  const selectedNext = nextSuggestion?.candidates.find(
    (c) => c.id === selectedNextId,
  );
  const representative = representativeTracks(state);
  const previewArgs = currentExecution(progress)?.previewArgs;
  const previewResult =
    active === "frontend" &&
    (!previewArgs ||
      previewArgs[1] !== category ||
      previewArgs[2] !== availableOnly)
      ? undefined
      : progress.result;
  const recorded = missions
    .filter((m) => state.progress[m.id]?.reflection)
    .map((m) => missionForProgress(m.id, state.progress[m.id]!) ?? m);
  const completed = recorded.filter((m) => isCompleted(state.progress[m.id]));
  const inProgress = missions.filter(
    (m) => state.progress[m.id] && !state.progress[m.id]?.reflection,
  );
  const playedGames = missions.filter((m) => state.games?.[m.id]);
  function answerProfile(field: "experience" | "purpose", value: string) {
    setState((s) => ({
      ...s,
      profile: updateProfileAnswer(s.profile, field, value),
    }));
  }
  function cancelCoach() {
    if (coachController.current)
      analytics.client.current?.track("ai_result", {
        source: "none",
        outcome: "canceled",
      });
    coachEpoch.current += 1;
    coachController.current?.abort();
    coachController.current = null;
    setAsking(false);
  }
  function cancelExecution() {
    executionEpoch.current += 1;
    setRunning(false);
  }
  function toast(message: string) {
    setNotice(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 4500);
  }
  function navigate(next: View, mode: HistoryMode = "push", track = active) {
    const url = new URL(window.location.href);
    url.searchParams.delete("track");
    url.searchParams.delete("view");
    if (next === "work") url.searchParams.set("track", track);
    else if (next !== "home") url.searchParams.set("view", next);
    url.hash = "";
    if (url.href !== window.location.href)
      window.history[mode === "push" ? "pushState" : "replaceState"](
        null,
        "",
        url,
      );
    entryHandled.current = url.href;
    cancelCoach();
    setModal(null);
    if (view === "work" && next !== "work")
      analytics.client.current?.end("left");
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    let alive = true;
    const controller = createPersistence({
      storage: {
        get length() {
          return localStorage.length;
        },
        key: (index) => localStorage.key(index),
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
      },
      tabStorage: {
        getItem: (key) => sessionStorage.getItem(key),
        setItem: (key, value) => sessionStorage.setItem(key, value),
        removeItem: (key) => sessionStorage.removeItem(key),
      },
      onState: (next) => {
        if (alive) setState(next);
      },
      onSaved: (next) => analytics.client.current?.saved(next),
      onStatus: (next) => {
        if (alive) setSaveStatus(next);
      },
    });
    persistence.current = controller;
    void controller.load();
    const onStorage = (e: StorageEvent) => {
      if (isRecordReset(e)) {
        cancelCoach();
        cancelExecution();
        controller.externalReset();
        setModal(null);
      }
    };
    window.addEventListener("storage", onStorage);
    fetch("/api/coach")
      .then((r) => r.json() as Promise<{ available: boolean }>)
      .then((d) => {
        if (alive) setAiAvailable(!!d.available);
      })
      .catch(() => {});
    return () => {
      alive = false;
      controller.dispose();
      executionEpoch.current += 1;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      window.removeEventListener("storage", onStorage);
      coachEpoch.current += 1;
      coachController.current?.abort();
    };
  }, []);
  useEffect(() => {
    persistence.current?.stage(state);
  }, [state]);
  useEffect(() => {
    const changed = () => setLocationVersion((value) => value + 1);
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  useEffect(() => {
    if (!ready || entryHandled.current === window.location.href) return;
    const url = new URL(window.location.href);
    const track = missions.find(
      (m) => m.id === url.searchParams.get("track"),
    )?.id;
    const next = url.searchParams.get("view");
    entryHandled.current = url.href;
    if (track) start(track, "replace");
    else
      navigate(
        next === "journal" || next === "compare" || next === "guide"
          ? next
          : "home",
        "replace",
      );
  }, [ready, initialTrack, initialView, locationVersion]);
  useEffect(() => {
    if (!analytics.status.enabled) return;
    analytics.client.current?.track("page_view", { page: view });
    if (view === "compare")
      analytics.client.current?.track("comparison_view", {
        completedCount: completed.length,
      });
  }, [view, analytics.status.token, completed.length]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !asking && !deleting) setModal(null);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [asking, deleting]);
  useEffect(() => {
    if (!modal) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const backgrounds = Array.from(
      document.querySelectorAll<HTMLElement>(
        "header.site-header,main,footer.site-footer",
      ),
    );
    backgrounds.forEach((el) => {
      el.inert = true;
    });
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = focusable(),
        first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = overflow;
      backgrounds.forEach((el) => {
        el.inert = false;
      });
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  function patch(id: TrackId, value: Partial<Progress>) {
    setState((s) => ({
      ...s,
      progress: {
        ...s.progress,
        [id]: {
          ...(s.progress[id] ?? initialProgress(missionById(id)!)),
          ...value,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  }
  function start(id: TrackId, mode: HistoryMode = "push") {
    if (!ready) return;
    if (!state.profile)
      setState((s) => ({
        ...s,
        profile: normalizeProfile(null),
      }));
    openWork(id, mode);
  }
  function openWork(id: TrackId, mode: HistoryMode = "push") {
    if (!state.progress[id] && !canStartMission(id)) {
      toast("지금은 새 체험을 준비 중이에요.");
      return;
    }
    cancelCoach();
    setActive(id);
    setHint("");
    setQuestion("");
    setHintSource("");
    setCoachTrace([]);
    setCoachReferences([]);
    setCoachAction("");
    setCategory("개발");
    setAvailableOnly(true);
    setTab("preview");
    const previous = state.progress[id];
    const selectedMission = previous
      ? missionForProgress(id, previous)
      : missionById(id);
    if (selectedMission)
      analytics.client.current?.begin(
        id,
        "code",
        selectedMission.contentVersion,
        previous ? "resume" : "new",
      );
    if (!previous) patch(id, initialProgress(missionById(id)!));
    setModal(null);
    navigate("work", mode, id);
  }
  function focusPracticeLine() {
    const needle = mission.practice?.focus;
    const index = needle ? progress.code.indexOf(needle) : -1;
    if (index < 0 || !editor.current) {
      toast("안내한 줄이 이미 바뀌었어요. 실행해서 결과를 확인해보세요.");
      return;
    }
    const start = progress.code.lastIndexOf("\n", index) + 1;
    const end = progress.code.indexOf("\n", index);
    analytics.client.current?.track("help_open", { kind: "line_locator" });
    editor.current.focus();
    editor.current.setSelectionRange(
      start,
      end < 0 ? progress.code.length : end,
    );
    editor.current.scrollTop = Math.max(
      0,
      progress.code.slice(0, start).split("\n").length * 23 -
        editor.current.clientHeight / 2,
    );
  }
  async function execute() {
    if (running || unavailableContent) return;
    const epoch = ++executionEpoch.current;
    setRunning(true);
    const code = progress.code;
    const executedAt = new Date().toISOString();
    const journey = analytics.client.current?.context();
    const result = await runMission(
      mission,
      code,
      active === "frontend" ? [events, category, availableOnly] : undefined,
    );
    if (epoch !== executionEpoch.current) return;
    const lastExecution = await snapshotExecution(
      progress,
      mission,
      result,
      executedAt,
      active === "frontend"
        ? [events, category, availableOnly]
        : mission.previewArgs,
    );
    if (epoch !== executionEpoch.current) return;
    analytics.client.current?.track(
      "run_result",
      {
        executionId: lastExecution.id,
        kind: lastExecution.kind,
        passed: result.tests.filter((t) => t.passed).length,
        total: result.tests.length,
        outcome: result.error ? "error" : "checks",
      },
      journey,
    );
    patch(active, {
      lastExecution,
      result: undefined,
      runs: progress.runs + 1,
    });
    setRunning(false);
    if (result.error || result.tests.some((t) => !t.passed)) setTab("tests");
    else if (result.tests.every((t) => t.passed))
      toast(
        "모든 확인 항목을 통과했어요. 어떤 과정이 재미있었는지 기록해보세요.",
      );
  }
  function basicHint() {
    if (unavailableContent) return;
    cancelCoach();
    analytics.client.current?.track("help_open", { kind: "basic_hint" });
    const level = Math.min(progress.hintLevel, 2);
    setHint(mission.hints[level]);
    setHintSource("기본 힌트");
    setCoachTrace([]);
    setCoachReferences([]);
    setCoachAction("");
    patch(active, { hintLevel: Math.min(progress.hintLevel + 1, 3) });
  }
  async function ask() {
    if (asking || !question.trim() || unavailableContent) return;
    if (!state.profile?.aiConsent) {
      toast(
        "맞춤 힌트는 AI 사용 동의 후 사용할 수 있어요. 준비된 힌트는 바로 볼 수 있어요.",
      );
      return;
    }
    analytics.client.current?.track("help_open", { kind: "ai_request" });
    const journey = analytics.client.current?.context();
    const requestEpoch = ++coachEpoch.current;
    const controller = new AbortController();
    coachController.current = controller;
    setAsking(true);
    setHint("");
    setCoachTrace([]);
    setCoachReferences([]);
    setCoachAction("");
    try {
      const execution = currentExecution(progress);
      const d = await requestCoach(
        {
          track: active,
          contentVersion: mission.contentVersion,
          code: progress.code,
          level: Math.min(progress.hintLevel, 2),
          question,
          tests: (execution?.result.tests ?? []).map((t) => ({
            label: t.label,
            passed: t.passed,
            error: t.error,
          })),
        },
        {
          state: latest.current,
          waitForSave: Promise.resolve(),
          saveState: (signal) => {
            persistence.current!.stage(latest.current);
            return persistence.current!.saveNow(signal);
          },
          signal: controller.signal,
        },
      );
      if (requestEpoch !== coachEpoch.current) return;

      analytics.client.current?.track(
        "ai_result",
        { source: d.source, outcome: "received" },
        journey,
      );
      setHint(d.message);
      setCoachTrace(d.trace ?? []);
      setCoachReferences(d.references ?? []);
      setCoachAction(d.nextAction ?? "");
      setHintSource(d.source === "ai" ? "AI가 고른 힌트" : "기본 힌트");
      if (d.notice) toast(d.notice);
      setQuestion("");
      patch(active, { hintLevel: Math.min(progress.hintLevel + 1, 3) });
    } catch (error) {
      if (requestEpoch !== coachEpoch.current) return;
      analytics.client.current?.track(
        "ai_result",
        { source: "guide", outcome: "failed" },
        journey,
      );
      setHint(mission.hints[Math.min(progress.hintLevel, 2)]);
      setHintSource("기본 힌트");
      toast(
        error instanceof DeadlineExceeded
          ? "AI 응답이 늦어 기본 힌트를 보여드려요. 계속 수정하고 실행할 수 있어요."
          : "맞춤 힌트를 가져오지 못해 기본 힌트를 보여드려요.",
      );
    } finally {
      if (requestEpoch === coachEpoch.current) {
        coachController.current = null;
        setAsking(false);
      }
    }
  }
  function rateReflection(
    field: "interest" | "difficulty" | "again",
    value: number,
  ) {
    if (reflection[field] === value) return;
    setReflection((r) => ({ ...r, [field]: value, next: "" }));
    setSelectedNextId("");
    setNextReason("");
  }
  function openReflection() {
    const r = progress.reflection;
    setReflection(
      r
        ? {
            interest: r.interest,
            difficulty: r.difficulty,
            again: r.again,
            note: r.note,
            next: r.next,
          }
        : { interest: 0, difficulty: 0, again: 0, note: "", next: "" },
    );
    const saved = r?.nextPlan;
    const execution = currentExecution(progress);
    const reuse = saved && execution?.id === saved.executionId;
    setSelectedNextId(reuse ? saved.selectedId : "");
    setNextReason(reuse ? saved.selectionReason : "");
    setModal("reflection");
  }
  function finishReflection() {
    if (!canRecordAttempt(progress)) return;
    if (
      !reflection.interest ||
      !reflection.difficulty ||
      !reflection.again ||
      !reflection.note.trim() ||
      !selectedNext ||
      !nextReason.trim()
    )
      return;
    const execution = currentExecution(progress)!;
    const nextPlan = makeNextActionPlan(
      mission,
      execution.id,
      reflection,
      nextContext,
      selectedNextId,
      nextReason,
    );
    if (!nextPlan || !selectedNext) return;
    const recorded: Reflection = {
      ...reflection,
      next: selectedNext.title,
      nextPlan,
      endedAt: new Date().toISOString(),
      execution: currentExecution(progress),
    };
    analytics.client.current?.reflectionSubmitted(active, recorded);
    analytics.client.current?.end("submitted");
    patch(active, { reflection: recorded });
    setModal(null);
    navigate("journal");
    toast("회고를 남겼어요. 상단에서 저장 상태를 확인해주세요.");
  }
  function download() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "haebogi-records.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function erase() {
    cancelCoach();
    cancelExecution();
    analytics.client.current?.pause();
    if (await persistence.current?.remove()) {
      setModal(null);
      navigate("home", "replace");
      void analytics.client.current?.load();
      toast("서버와 이 기기의 체험 기록을 삭제했어요.");
    }
  }
  const passed = progress.result?.tests.filter((t) => t.passed).length ?? 0;
  const hasAttempt = canRecordAttempt(progress);
  const resumeMission = missions
    .filter((m) => state.progress[m.id] && !isCompleted(state.progress[m.id]!))
    .sort((a, b) =>
      (state.progress[b.id]?.updatedAt ?? "").localeCompare(
        state.progress[a.id]?.updatedAt ?? "",
      ),
    )[0];
  const reflectionPrompt = !hasAttempt
    ? "코드를 수정하고 실행한 뒤 기록할 수 있어요."
    : !reflection.interest || !reflection.difficulty || !reflection.again
      ? "세 가지 질문에 점수를 골라주세요."
      : !reflection.note.trim()
        ? "재미있거나 어려웠던 순간을 짧게 적어주세요."
        : !selectedNext
          ? "다음에 해볼 활동을 골라주세요."
          : !nextReason.trim()
            ? "이 활동을 고른 이유를 적어주세요."
            : "";
  return (
    <div className={`app-shell view-${view}`}>
      <header className="site-header">
        <div className="nav-inner">
          <button
            className="brand"
            onClick={() => navigate("home")}
            aria-label="해보기 홈"
          >
            <span className="brand-mark">
              <FlaskConical size={23} />
            </span>
            <span>해보기</span>
          </button>
          <nav aria-label="주 메뉴">
            {(
              [
                ["home", "체험실"],
                ["journal", "나의 기록"],
                ["compare", "비교하기"],
              ] as [View, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                className={
                  view === id || (view === "work" && id === "home")
                    ? "active"
                    : ""
                }
                onClick={() => navigate(id)}
                aria-current={
                  view === id || (view === "work" && id === "home")
                    ? "page"
                    : undefined
                }
              >
                {label}
                {id === "journal" && completed.length > 0 && (
                  <span className="nav-count">{completed.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="nav-end">
            <button className="guide-link" onClick={() => navigate("guide")}>
              <HelpCircle size={17} /> 도움말
            </button>
            <span
              className={`save-state ${saveStatus.phase}`}
              aria-live="polite"
              title={
                saveStatus.savedAt
                  ? `마지막 서버 저장 ${formatTime(saveStatus.savedAt)}`
                  : "아직 서버에 저장한 기록이 없어요"
              }
            >
              {saveStatus.phase === "error" ||
              saveStatus.phase === "conflict" ? (
                <CloudOff size={15} />
              ) : (
                <Cloud size={15} />
              )}
              <span>{saveLabel}</span>
              {saveStatus.savedAt && (
                <time dateTime={saveStatus.savedAt}>
                  {formatTime(saveStatus.savedAt)}
                </time>
              )}
            </span>
          </div>
        </div>
      </header>
      <div className={`mobile-save-state ${saveStatus.phase}`} role="status">
        <span>{saveLabel}</span>
        {saveStatus.savedAt && (
          <time dateTime={saveStatus.savedAt}>
            마지막 서버 저장 {formatTime(saveStatus.savedAt)}
          </time>
        )}
      </div>
      {saveStatus.phase === "loading" && (
        <div className="loading-strip" role="status">
          체험 기록을 불러오고 있어요.
        </div>
      )}
      {saveStatus.ready && analytics.status.phase === "loading" && (
        <div className="loading-strip" role="status">
          참여 설정을 확인하고 있어요.
        </div>
      )}
      {["error", "recovery", "conflict"].includes(saveStatus.phase) && (
        <section className="storage-banner" aria-label="기록 저장 안내">
          <div role="status">
            <strong>{saveStatus.message}</strong>
            <p>
              {saveStatus.localSaved
                ? "이 브라우저에 초안을 보관하고 있어요."
                : hasWork(state)
                  ? "기기 초안을 저장하지 못했어요. 기록을 내려받아 보관해주세요."
                  : "이 브라우저에 보관된 초안은 없어요."}
            </p>
          </div>
          <div className="storage-actions">
            {saveStatus.phase === "recovery" ? (
              <button
                className="btn primary compact"
                onClick={() => void persistence.current?.restore()}
              >
                초안 복구해 저장
              </button>
            ) : saveStatus.phase === "conflict" ? (
              saveStatus.canResolve ? (
                <>
                  <button
                    className="btn primary compact"
                    onClick={() =>
                      void persistence.current?.resolveConflict("local")
                    }
                  >
                    겹친 부분은 이 탭 내용 유지
                  </button>
                  <button
                    className="btn secondary compact"
                    onClick={() =>
                      void persistence.current?.resolveConflict("remote")
                    }
                  >
                    겹친 부분은 서버 내용 사용
                  </button>
                </>
              ) : (
                <button
                  className="btn secondary compact"
                  onClick={() => location.reload()}
                >
                  새로고침
                </button>
              )
            ) : (
              <button
                className="btn primary compact"
                onClick={() => void persistence.current?.retry()}
              >
                다시 시도
              </button>
            )}
            <button className="btn secondary compact" onClick={download}>
              기록 내려받기
            </button>
            {saveStatus.phase === "recovery" && (
              <button
                className="danger-link"
                onClick={() => setModal("delete")}
              >
                초안 버리고 새로 시작
              </button>
            )}
          </div>
        </section>
      )}
      {!!saveStatus.pendingDrafts && saveStatus.ready && (
        <div className="storage-banner" role="status">
          다른 창에서 저장하지 못한 초안이 {saveStatus.pendingDrafts}개 남아
          있어요.
          <button
            className="btn secondary compact"
            onClick={() => void persistence.current?.recoverNextDraft()}
          >
            남은 초안 확인
          </button>
        </div>
      )}
      {!saveStatus.localSaved &&
        ["saving", "saved"].includes(saveStatus.phase) && (
          <div className="storage-banner" role="status">
            기기 저장 공간이 부족해 초안을 보관하지 못했어요.{" "}
            {saveStatus.phase === "saved"
              ? "서버 기록은 저장됐어요."
              : "창을 닫기 전 저장 완료를 확인하거나 기록을 내려받아주세요."}
            <button className="btn secondary compact" onClick={download}>
              기록 내려받기
            </button>
          </div>
        )}
      {view === "home" && (
        <main inert={!ready} className="home wrap">
          <section className="welcome">
            <h1>어떤 일을 해보고 싶나요?</h1>
            <p className="welcome-description">
              교내 행사 서비스의 작은 업무로, 궁금했던 직무를 경험해봐요.
            </p>
            <ol className="experience-path" aria-label="체험 흐름">
              <li>업무 해보기</li>
              <li>흥미·어려움 비교하기</li>
              <li>다음 학습 고르기</li>
            </ol>
            <p className="welcome-prerequisite">
              JavaScript 기초가 있다면 한 줄 수정부터 시작해요.{" "}
              <Link href="/games">코드가 낯설면 게임으로 둘러보기</Link>
            </p>
          </section>
          {resumeMission && (
            <section className="resume-panel" aria-label="진행 중인 체험">
              <span className="resume-icon">
                <TrackIcon id={resumeMission.id} />
              </span>
              <div>
                <p>이어서 해볼까요?</p>
                <h2>{taskLabels[resumeMission.id].title}</h2>
              </div>
              <button
                className="btn primary compact"
                disabled={!ready}
                onClick={() => start(resumeMission.id)}
              >
                이어하기 <ChevronRight size={16} />
              </button>
            </section>
          )}
          <section id="tracks" className="catalog">
            <div className="catalog-heading">
              <h2>직무 고르기</h2>
              <div
                className="catalog-filters"
                role="group"
                aria-label="직무 분야"
              >
                {groups.map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={group === id}
                    className={group === id ? "selected" : ""}
                    onClick={() => setGroup(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="catalog-grid">
              {missions
                .filter((m) => group === "all" || trackGroup[m.id] === group)
                .map((m) => {
                  const p = state.progress[m.id];
                  const pinnedMission = p ? missionForProgress(m.id, p) : m;
                  return (
                    <article className={`job-card ${m.color}`} key={m.id}>
                      <button
                        className="job-open"
                        disabled={!ready || (!p && !canStartMission(m.id))}
                        onClick={() => start(m.id)}
                        aria-label={`${m.title} ${p ? (isCompleted(p) ? "체험 다시 열기" : "이어서 해보기") : canStartMission(m.id) ? "체험 시작" : "새 체험 준비 중"}`}
                      >
                        <div className="job-top">
                          <span className="job-icon">
                            <TrackIcon id={m.id} size={25} />
                          </span>
                          {(p || !canStartMission(m.id)) && (
                            <span className="job-status">
                              {p
                                ? p.reflection
                                  ? recordStatus(p)
                                  : "진행 중"
                                : "새 체험 준비 중"}
                            </span>
                          )}
                        </div>
                        <div className="job-info">
                          <p className="job-role">{m.title}</p>
                          <h3>{taskLabels[m.id].title}</h3>
                          <p>{taskLabels[m.id].description}</p>
                          <div className="job-bottom">
                            <span>
                              {pinnedMission
                                ? `약 ${pinnedMission.time}`
                                : "과제 시간 미확인"}
                            </span>
                            <span className="job-link">
                              {p
                                ? isCompleted(p)
                                  ? "다시 열기"
                                  : "이어하기"
                                : "시작하기"}{" "}
                              <ChevronRight size={16} />
                            </span>
                          </div>
                        </div>
                      </button>
                    </article>
                  );
                })}
            </div>
          </section>
          {completed.length > 0 && (
            <button
              className="continue-strip"
              onClick={() => navigate("compare")}
            >
              <BookOpen size={20} />
              <span>지금까지 {completed.length}개의 체험을 기록했어요.</span>
              <strong>나란히 비교하기</strong>
              <ChevronRight size={18} />
            </button>
          )}
          <Link className="game-entry" href="/games">
            <span className="game-entry-icon">
              <Monitor size={24} />
            </span>
            <div>
              <h2>코드가 아직 낯설다면</h2>
              <p>게임으로 직무를 먼저 둘러봐요.</p>
            </div>
            <span className="game-entry-action">
              게임 해보기 <ChevronRight size={18} />
            </span>
          </Link>
          <footer className="site-footer">
            <span>
              해보기 <small>작게 해보고, 다음을 골라요.</small>
            </span>
            <button onClick={() => navigate("guide")}>
              이용 · 데이터 안내
            </button>
          </footer>
        </main>
      )}
      {view === "work" && unavailableContent && (
        <main inert={!ready} className="wrap records-page">
          <button className="btn secondary" onClick={() => navigate("home")}>
            체험실로
          </button>
          <h1>이전 과제 자료를 찾을 수 없어요.</h1>
          <p>
            코드와 회고는 보관하고 있어요. 다른 버전의 테스트나 힌트는 적용하지
            않아요.
          </p>
          <label className="form-label">
            보관된 코드
            <textarea
              readOnly
              aria-label="보관된 코드"
              rows={12}
              value={progress.code}
            />
          </label>
          <button className="btn secondary" onClick={download}>
            기록 내려받기
          </button>
          <button className="btn secondary" onClick={() => navigate("journal")}>
            나의 기록 보기
          </button>
        </main>
      )}
      {view === "work" && !unavailableContent && (
        <main inert={!ready} className="work wrap">
          <div className="work-heading">
            <div>
              <button className="back-link" onClick={() => navigate("home")}>
                <ChevronLeft size={16} /> 체험실로
              </button>
              <h1>
                <span className={`work-icon ${mission.color}`}>
                  <TrackIcon id={active} />
                </span>
                {mission.action}
              </h1>
              <p>
                {mission.title} 체험 <span>·</span> JavaScript <span>·</span> 약{" "}
                {mission.time}
              </p>
            </div>
            <button
              className="btn secondary"
              disabled={!hasAttempt || running}
              onClick={openReflection}
            >
              <CheckCheck size={18} /> 체험 기록
            </button>
          </div>
          <ol className="work-journey" aria-label="체험 순서">
            <li className={progress.runs ? "done" : "current"}>
              <span>1</span> 코드 바꾸기
            </li>
            <li className={progress.runs ? "current" : ""}>
              <span>2</span> 실행 · 결과 확인
            </li>
            <li className={isCompleted(progress) ? "done" : ""}>
              <span>3</span> 체험 기록
            </li>
          </ol>
          <div className="work-grid">
            <aside className="mission-brief">
              <div className="brief-label">
                <BookOpen size={18} /> 해볼 일
              </div>
              <p>{mission.brief}</p>
              <details className="ai-details">
                <summary>시작한 과제 기준</summary>
                <p>
                  버전 {mission.contentVersion} · 코드·테스트·힌트를 같은
                  기준으로 이어가요.
                </p>
                {progress.contentVersionSource === "legacy_baseline" && (
                  <p>
                    이전 체험은 기존 과제로 이어가요. 예전 실행은 버전을 확인할
                    수 없어, 다시 실행하면 현재 기준을 기록해요.
                  </p>
                )}
              </details>
              {mission.practice && (
                <section className="practice-start" aria-label="처음 시작 안내">
                  <h2>한 줄부터 바꿔봐요</h2>
                  <p>{mission.practice.firstAction}</p>
                  <div className="practice-example">
                    <span>예를 들어</span>
                    <p>{mission.practice.example.input}</p>
                    <strong>{mission.practice.example.outcome}</strong>
                  </div>
                  <button
                    className="btn secondary compact"
                    onClick={focusPracticeLine}
                  >
                    바꿀 줄 찾기
                  </button>
                  {progress.runs === 0 && (
                    <button
                      className="solution-link"
                      onClick={execute}
                      disabled={running}
                    >
                      먼저 그대로 실행해보기
                    </button>
                  )}
                </section>
              )}
              <h2>확인할 상황</h2>
              <ol className="checklist">
                {mission.steps.map((step, i) => (
                  <li key={step}>
                    <span>{i + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
              <details
                className="primer"
                onToggle={(e) => {
                  if (e.currentTarget.open)
                    analytics.client.current?.track("help_open", {
                      kind: "primer",
                    });
                }}
              >
                <summary>문법이 가물가물한가요?</summary>
                <p>작은 예제로 필요한 문법부터 확인해보세요.</p>
                <pre>
                  {mission.practice?.primer ??
                    (active === "frontend"
                      ? "const numbers = [1, 2, 3];\nconst bigger = numbers.filter(n => n > 1);\n// [2, 3]"
                      : active === "backend"
                        ? "if (names.includes('mina')) {\n  return { accepted: false };\n}\n// 배열에 값이 있는지 확인해요."
                        : active === "security"
                          ? "if (!user) return 401;\nconst isOwner = user.id === record.ownerId;"
                          : active === "cloud"
                            ? "const errorRate = errors / requests;\n// 2%는 0.02예요.\nif (slow || failing) return 'rollback';"
                            : "const unique = new Set();\nunique.add('개발:a');\nunique.has('개발:a'); // true")}
                </pre>
              </details>
              <button
                className="solution-link"
                onClick={() => setModal("solution")}
              >
                참고 풀이 살펴보기
              </button>
            </aside>
            <section className="workspace">
              <div className="editor-head">
                <span>
                  <Code2 size={16} />
                  {mission.fn}.js
                </span>
                <div>
                  <button
                    title="코드 다운로드"
                    aria-label="코드 다운로드"
                    onClick={() => {
                      const u = URL.createObjectURL(
                        new Blob([progress.code], {
                          type: "text/javascript",
                        }),
                      );
                      const a = document.createElement("a");
                      a.href = u;
                      a.download = active + ".js";
                      a.click();
                      URL.revokeObjectURL(u);
                    }}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    title="처음 코드로 되돌리기"
                    aria-label="처음 코드로 되돌리기"
                    onClick={() => setModal("reset")}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>
              <div className="code-area">
                <div aria-hidden="true" className="line-numbers">
                  {progress.code.split("\n").map((_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
                <textarea
                  ref={editor}
                  aria-label="미션 코드 편집기"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={progress.code}
                  readOnly={running}
                  aria-busy={running}
                  maxLength={20000}
                  onChange={(e) =>
                    patch(active, changeCode(progress, e.target.value, "user"))
                  }
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      execute();
                    }
                  }}
                />
              </div>
              <div className="editor-bottom">
                <span>
                  코드를 수정하고 실행해보세요 <kbd>⌘ / Ctrl + Enter</kbd>
                </span>
                <button
                  className="btn primary compact"
                  aria-disabled={running}
                  onClick={execute}
                >
                  {running ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Play size={15} fill="currentColor" />
                  )}
                  {running ? "실행 중" : "코드 실행"}
                </button>
              </div>
              <div
                className="output-head"
                role="tablist"
                aria-label="실행 결과"
              >
                {(
                  [
                    ["preview", "미리보기"],
                    [
                      "tests",
                      `확인 항목${progress.result ? " " + passed + "/5" : ""}`,
                    ],
                    ["data", "입력 데이터"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    id={`output-tab-${id}`}
                    role="tab"
                    aria-selected={tab === id}
                    aria-controls="output-panel"
                    tabIndex={tab === id ? 0 : -1}
                    className={tab === id ? "active" : ""}
                    onClick={() => setTab(id)}
                    onKeyDown={(e) => {
                      const ids = ["preview", "tests", "data"] as const;
                      const i = ids.indexOf(id);
                      const next =
                        e.key === "ArrowRight"
                          ? (i + 1) % ids.length
                          : e.key === "ArrowLeft"
                            ? (i + ids.length - 1) % ids.length
                            : e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? ids.length - 1
                                : -1;
                      if (next < 0) return;
                      e.preventDefault();
                      setTab(ids[next]);
                      document
                        .getElementById(`output-tab-${ids[next]}`)
                        ?.focus();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                className="output-panel"
                id="output-panel"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby={`output-tab-${tab}`}
              >
                {tab === "preview" && (
                  <>
                    {active === "frontend" && (
                      <div className="preview-filters">
                        <label>
                          카테고리
                          <select
                            value={category}
                            onChange={(e) => {
                              setCategory(e.target.value);
                              patch(active, { result: undefined });
                            }}
                          >
                            {["전체", "개발", "진로", "동아리"].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={availableOnly}
                            onChange={(e) => {
                              setAvailableOnly(e.target.checked);
                              patch(active, { result: undefined });
                            }}
                          />
                          신청 가능한 행사만
                        </label>
                      </div>
                    )}
                    {!previewResult ? (
                      <div className="output-empty">
                        <Monitor size={30} />
                        <h3>나의 코드가 만드는 결과</h3>
                        <p>
                          {active === "frontend"
                            ? "필터를 고른 뒤 코드를 실행하면 행사 목록이 바뀌어요."
                            : "코드를 실행하면 실제 반환값을 여기에서 확인할 수 있어요."}
                        </p>
                      </div>
                    ) : previewResult.error ? (
                      <div className="error-message">{previewResult.error}</div>
                    ) : active === "frontend" ? (
                      <div className="events-preview">
                        {Array.isArray(previewResult.preview) ? (
                          previewResult.preview.length ? (
                            previewResult.preview.map(
                              (item: unknown, i: number) => {
                                const event = item as (typeof events)[number];
                                return (
                                  <div className="preview-event" key={i}>
                                    <div
                                      className={`event-symbol ${i % 2 ? "teal" : "blue"}`}
                                    >
                                      <Code2 size={21} />
                                    </div>
                                    <div>
                                      <b>
                                        {typeof event?.title === "string"
                                          ? event.title
                                          : "제목 없음"}
                                      </b>
                                      <small>
                                        {String(event?.category ?? "")} ·{" "}
                                        {String(event?.registered ?? "")} /{" "}
                                        {String(event?.capacity ?? "")}명
                                      </small>
                                    </div>
                                    <span>
                                      {Number(event?.registered) <
                                      Number(event?.capacity)
                                        ? "신청 가능"
                                        : "마감"}
                                    </span>
                                  </div>
                                );
                              },
                            )
                          ) : (
                            <div className="output-empty">
                              <Search size={25} />
                              <p>조건에 맞는 행사가 없어요.</p>
                            </div>
                          )
                        ) : (
                          <p className="error-message">
                            행사 목록은 배열로 반환해주세요.
                          </p>
                        )}
                      </div>
                    ) : active === "data" &&
                      Array.isArray(previewResult.preview) &&
                      previewResult.preview.length ? (
                      <div className="data-result">
                        <h3>카테고리별 참여율</h3>
                        {previewResult.preview.map(
                          (item: unknown, i: number) => {
                            const x = item as {
                              category?: string;
                              rate?: number;
                              total?: number;
                              attended?: number;
                            };
                            const rate = Number(x?.rate);
                            return (
                              <div key={i}>
                                <span>{String(x?.category ?? "")}</span>
                                <div className="bar-track">
                                  <i
                                    style={{
                                      width: `${Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0}%`,
                                    }}
                                  />
                                </div>
                                <b>{Number.isFinite(rate) ? rate : "?"}%</b>
                                <small>
                                  {String(x?.attended ?? "?")} /{" "}
                                  {String(x?.total ?? "?")}명
                                </small>
                              </div>
                            );
                          },
                        )}
                        <p>표본 크기와 집계 기준을 함께 보고 해석해보세요.</p>
                      </div>
                    ) : (
                      <div className="json-preview">
                        <span>나의 함수 반환값</span>
                        <pre>
                          {JSON.stringify(previewResult.preview, null, 2) ??
                            "undefined"}
                        </pre>
                        {active === "backend" && (
                          <small>
                            예시 요청: 2명 정원에 2명이 신청한 행사에 새
                            사용자가 신청해요.
                          </small>
                        )}
                      </div>
                    )}
                  </>
                )}
                {tab === "tests" &&
                  (!progress.result ? (
                    <div className="output-empty">
                      <CheckCircle2 size={30} />
                      <p>코드를 실행하면 다섯 가지 상황을 확인해요.</p>
                    </div>
                  ) : progress.result.error ? (
                    <div className="error-message">{progress.result.error}</div>
                  ) : (
                    <div className="tests-list">
                      {progress.result.tests.map((test, i) => (
                        <details
                          key={i}
                          className={test.passed ? "pass" : "fail"}
                          open={
                            !test.passed &&
                            i ===
                              progress.result!.tests.findIndex((t) => !t.passed)
                          }
                        >
                          <summary>
                            {test.passed ? (
                              <CheckCircle2 size={17} />
                            ) : (
                              <HelpCircle size={17} />
                            )}
                            <span>{test.label}</span>
                            <small>{test.passed ? "통과" : "확인 필요"}</small>
                            <ChevronRight size={15} />
                          </summary>
                          <p>{test.why}</p>
                          <span className="test-caption">이 상황의 입력</span>
                          <p>{describeInput(mission, i)}</p>
                          {test.error ? (
                            <pre>{test.error}</pre>
                          ) : (
                            <>
                              <span className="test-caption">기대 결과</span>
                              <pre>{describeResult(active, test.expected)}</pre>
                              <span className="test-caption">나의 결과</span>
                              <pre>{describeResult(active, test.actual)}</pre>
                            </>
                          )}
                          <details className="check-raw">
                            <summary>입력·반환값 자세히</summary>
                            <pre>
                              {JSON.stringify(
                                {
                                  input: mission.tests[i]?.args,
                                  expected: test.expected,
                                  actual: test.actual,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        </details>
                      ))}
                    </div>
                  ))}
                {tab === "data" && (
                  <div className="json-preview">
                    <span>미션에 제공하는 예시 데이터</span>
                    <pre>
                      {JSON.stringify(
                        Object.fromEntries(
                          mission.previewArgs.map((value, i) => [
                            ["frontend", "data"].includes(active)
                              ? active === "frontend"
                                ? ["events", "category", "availableOnly"][i]
                                : "rows"
                              : "입력 " + (i + 1),
                            value,
                          ]),
                        ),
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                )}
              </div>
              <div className="workspace-note">
                <Check size={14} />{" "}
                {currentExecution(progress)?.kind === "reference"
                  ? "참고 풀이를 직접 수정하고 실행하면 기록할 수 있어요."
                  : "수정한 코드를 실행하면 체험을 기록할 수 있어요."}
              </div>
            </section>
            <aside
              className="coach-panel"
              id="coach-panel"
              aria-label="AI 코치"
            >
              <div className="hint-section">
                <h2>
                  <MessageCircle size={18} /> AI 코치
                </h2>
                <p>코드와 질문에 맞는 검수 힌트를 골라요.</p>
                <details className="ai-details" open={aiAvailable}>
                  <summary>
                    <MessageCircle size={16} /> AI에게 질문하기{" "}
                    <ChevronRight className="disclosure-chevron" size={16} />
                  </summary>
                  {!aiAvailable && (
                    <p className="muted">
                      AI 연결 전이에요. 기본 힌트를 이용해주세요.
                    </p>
                  )}
                  {!state.profile?.aiConsent && (
                    <label className="consent-inline">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() =>
                          setState((s) => ({
                            ...s,
                            profile: {
                              ...normalizeProfile(s.profile),
                              aiConsent: true,
                            },
                          }))
                        }
                      />{" "}
                      코드·질문·실행 결과를 OpenAI에 보내는 데 동의해요.
                      개인정보와 비밀키는 제외해주세요.
                    </label>
                  )}
                  <textarea
                    aria-label="코드에 대한 질문"
                    value={question}
                    maxLength={600}
                    disabled={asking}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="어떤 조건부터 확인하면 좋을까요?"
                    rows={3}
                  />
                  <button
                    className="btn soft full"
                    onClick={ask}
                    disabled={
                      asking ||
                      !question.trim() ||
                      !aiAvailable ||
                      !state.profile?.aiConsent
                    }
                  >
                    {asking ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <MessageCircle size={16} />
                    )}{" "}
                    맞춤 힌트 받기
                  </button>
                </details>

                <button className="btn soft full" onClick={basicHint}>
                  기본 힌트 {Math.min(progress.hintLevel + 1, 3)} 보기
                </button>
                {asking && (
                  <div className="coach-working" role="status">
                    <LoaderCircle size={16} className="spin" /> 코드와 실행
                    결과를 살펴보는 중
                  </div>
                )}
                {hint && (
                  <div className="hint-answer" role="status">
                    <span>{hintSource}</span>
                    {coachTrace.length > 0 && (
                      <ol className="coach-trace">
                        {coachTrace.map((step, i) => (
                          <li key={i}>
                            <Check size={12} />
                            {step}
                          </li>
                        ))}
                      </ol>
                    )}
                    <p>{hint}</p>
                    {coachReferences.length > 0 && (
                      <details className="ai-details">
                        <summary>과제 근거 보기</summary>
                        <ul>
                          {coachReferences.map((ref) => (
                            <li key={ref.id}>{ref.label}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {coachAction && (
                      <button
                        className="coach-next"
                        disabled={running}
                        onClick={() =>
                          coachAction === "inspect"
                            ? setTab("tests")
                            : execute()
                        }
                      >
                        {coachAction === "inspect"
                          ? "확인 항목 살펴보기"
                          : "수정한 코드 실행하기"}
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      )}
      {view === "journal" && (
        <main inert={!ready} className="wrap records-page">
          <div className="page-intro">
            <h1>나의 기록</h1>
            <p>직접 해본 일과 다음에 해볼 일을 모았어요.</p>
          </div>
          {!!inProgress.length && (
            <section
              className="experience-section"
              aria-labelledby="in-progress-heading"
            >
              <h2 id="in-progress-heading">이어서 해볼 코드 체험</h2>
              <div className="record-grid">
                {inProgress.map((m) => {
                  const p = state.progress[m.id]!;
                  return (
                    <article className="record-card" key={m.id}>
                      <div className="record-top">
                        <span>{m.title} · 진행 중</span>
                      </div>
                      <h3>{m.action}</h3>
                      <p>
                        실행 {p.runs}회 ·{" "}
                        {canRecordAttempt(p)
                          ? "회고를 남기면 완료 기록이 돼요."
                          : "코드를 수정하고 실행해보세요."}
                      </p>
                      <p className="record-execution">
                        마지막 수정 {formatTime(p.updatedAt)}
                      </p>
                      <button
                        className="btn primary compact"
                        onClick={() => openWork(m.id)}
                      >
                        이어서 하기 <ChevronRight size={16} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {!!playedGames.length && (
            <section
              className="experience-section"
              aria-labelledby="game-records-heading"
            >
              <h2 id="game-records-heading">코드 없이 해본 게임</h2>
              <p>
                게임에서 느낀 흥미예요. 코드 체험의 완료·회고와 따로 기록해요.
              </p>
              <div className="record-grid">
                {playedGames.map((m) => {
                  const g = state.games![m.id]!;
                  return (
                    <article className="record-card" key={m.id}>
                      <div className="record-top">
                        <span>{m.title} · 게임 완료</span>
                        <small>
                          {new Date(g.completedAt).toLocaleDateString("ko-KR")}
                        </small>
                      </div>
                      <h3>{m.title} 업무 맛보기</h3>
                      <p>
                        흥미{" "}
                        {g.interest
                          ? `${g.interest}/5`
                          : "아직 평가하지 않았어요"}
                      </p>
                      <div className="experience-actions">
                        <button
                          className="btn primary compact"
                          onClick={() => start(m.id)}
                        >
                          같은 직무 코드 체험
                        </button>
                        <Link
                          className="btn secondary compact"
                          href={`/games?track=${m.id}`}
                        >
                          게임·흥미 평가 열기
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button
                className="btn secondary"
                onClick={() => navigate("compare")}
              >
                게임 흥미 비교하기
              </button>
            </section>
          )}
          {!recorded.length && !inProgress.length && !playedGames.length ? (
            <div className="empty-state">
              <FolderOpen size={42} />
              <h2>아직 남긴 회고가 없어요</h2>
              <p>
                코드를 수정하고 실행한 뒤 회고를 남기면
                <br />
                나만의 경험이 이곳에 쌓여요.
              </p>
              <button className="btn primary" onClick={() => navigate("home")}>
                체험 고르기
              </button>
            </div>
          ) : (
            !!recorded.length && (
              <>
                <div className="record-grid">
                  {recorded.map((m) => {
                    const p = state.progress[m.id]!,
                      r = p.reflection!;
                    return (
                      <article className="record-card" key={m.id}>
                        <div className={`record-icon ${m.color}`}>
                          <TrackIcon id={m.id} />
                        </div>
                        <div className="record-top">
                          <span>
                            {m.title} · {recordStatus(p)}
                          </span>
                          <small>
                            {new Date(r.endedAt).toLocaleDateString("ko-KR")}
                          </small>
                        </div>
                        <h2>{m.action}</h2>
                        <div className="score-summary">
                          <span>
                            흥미 <b>{r.interest}/5</b>
                          </span>
                          <span>
                            체감 난이도 <b>{r.difficulty}/5</b>
                          </span>
                          <span>
                            다시 해보고 싶음 <b>{r.again}/5</b>
                          </span>
                        </div>
                        {r.execution && (
                          <p className="record-execution">
                            {r.execution.contentVersion
                              ? `과제 ${r.execution.contentVersion} · `
                              : "과제 기준 미확인 · "}
                            기록한 실행:{" "}
                            {
                              r.execution.result.tests.filter((t) => t.passed)
                                .length
                            }
                            /{r.execution.result.tests.length} 통과 ·{" "}
                            {new Date(r.execution.executedAt).toLocaleString(
                              "ko-KR",
                            )}
                          </p>
                        )}
                        <p className="record-note">{r.note}</p>
                        <div className="next-action">
                          <span>다음에 해볼 일</span>
                          <b>{r.next}</b>
                          {r.nextPlan && (
                            <>
                              <p className="next-plan-reason">
                                선택 당시 제안: {r.nextPlan.reason}
                              </p>
                              <p className="next-plan-choice">
                                내 선택 이유: {r.nextPlan.selectionReason}
                              </p>
                            </>
                          )}
                          {selectedActivity(r) && (
                            <Link
                              className="btn primary compact"
                              href={activityHref(selectedActivity(r)!)}
                            >
                              {selectedActivity(r)!.kind === "explore"
                                ? "선택한 직무 체험하기"
                                : "선택한 활동 안내 보기"}{" "}
                              <ChevronRight size={16} />
                            </Link>
                          )}
                        </div>
                        <div className="record-foot">
                          <small>
                            실행 {p.runs}회 · 힌트 {p.hintLevel}단계
                            {p.usedSolution ? " · 참고 풀이 열람" : ""}
                          </small>
                          <button
                            className="text-button"
                            onClick={() => openWork(m.id)}
                          >
                            다시 열기
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <button
                  className="btn primary"
                  onClick={() => navigate("compare")}
                >
                  체험 비교하기
                </button>
              </>
            )
          )}
          <section className="record-settings">
            <div>
              <h2>체험 기록 관리</h2>
              <p role="status">
                {saveLabel}
                {saveStatus.savedAt
                  ? ` · 마지막 서버 저장 ${formatTime(saveStatus.savedAt)}`
                  : " · 아직 서버 저장 기록이 없어요"}
              </p>
              {saveStatus.expiresAt && (
                <p>
                  서버 보관 기한 {formatTime(saveStatus.expiresAt)} · 수정해서
                  저장하면 30일 연장돼요.
                </p>
              )}
              <details className="retention-details">
                <summary>보관·삭제 안내</summary>
                <p>
                  서버 체험 기록과 AI 호출 정보는 30일 보관해요. 만료된 자료는
                  매일 정리하며, 기한이 지난 체험 기록은 불러오지 않아요.
                </p>
                <p>
                  기기 초안은 이 브라우저에 남아요. 서버 기록이 없으면 자동으로
                  다시 올리지 않고 복구할지 물어봐요. 브라우저 데이터를 지우면
                  초안과 이어하기 정보도 사라져요.
                </p>
                <p>
                  전체 삭제는 코드·회고·게임 완료·흥미 평가·사전 응답·AI 호출
                  정보를 지워요. 재저장 방지용 익명 표시만 30일, 오늘의 AI 사용
                  횟수는 하루 동안 유지해요.
                </p>
              </details>
            </div>
            <div>
              <button className="btn secondary compact" onClick={download}>
                <Download size={15} /> 기록 내려받기
              </button>
              <button
                className="danger-link"
                onClick={() => setModal("delete")}
              >
                <Trash2 size={15} /> 전체 기록 삭제
              </button>
            </div>
          </section>
        </main>
      )}
      {view === "compare" && (
        <main inert={!ready} className="wrap compare-page">
          <div className="page-intro">
            <h1>체험 비교</h1>
            <p>어떤 일이 재미있었는지, 내 회고를 나란히 살펴봐요.</p>
          </div>
          {!!playedGames.length && (
            <section
              className="experience-section"
              aria-labelledby="game-comparison-heading"
            >
              <h2 id="game-comparison-heading">게임에서 느낀 흥미</h2>
              <p>
                코드 없이 해본 경험끼리 비교해요. 미평가는 점수에 포함하지
                않아요.
              </p>
              <div className="compare-table-wrap">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>직무 게임</th>
                      <th>흥미</th>
                      <th>다음 경험</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playedGames.map((m) => (
                      <tr key={m.id}>
                        <th>{m.title}</th>
                        <td>
                          {state.games![m.id]!.interest
                            ? `${state.games![m.id]!.interest} / 5`
                            : "미평가"}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => start(m.id)}
                          >
                            코드로도 해보기 <ChevronRight size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <h2>코드 체험 회고 비교</h2>
          {completed.length < 2 ? (
            <div className="empty-state">
              <ChartNoAxesCombined size={42} />
              <h2>
                {completed.length
                  ? "한 가지 작업을 더 경험해볼까요?"
                  : "서로 다른 작업을 비교해보세요."}
              </h2>
              <p>
                두 가지 체험에 회고를 남기면
                <br />
                흥미와 어려움을 나란히 볼 수 있어요.
              </p>
              <button className="btn primary" onClick={() => navigate("home")}>
                다른 체험 고르기
              </button>
            </div>
          ) : (
            <>
              <div
                className="compare-table-wrap"
                tabIndex={0}
                role="region"
                aria-label="직무별 회고 비교"
              >
                <table
                  className="compare-table"
                  style={{ minWidth: 160 + completed.length * 220 }}
                >
                  <thead>
                    <tr>
                      <th>나의 회고</th>
                      {completed.map((m) => (
                        <th key={m.id}>
                          <span className={`compare-icon ${m.color}`}>
                            <TrackIcon id={m.id} />
                          </span>
                          {m.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["interest", "흥미"],
                        ["difficulty", "체감 난이도"],
                        ["again", "다시 해보고 싶은 정도"],
                      ] as const
                    ).map(([key, label]) => (
                      <tr key={key}>
                        <th>{label}</th>
                        {completed.map((m) => (
                          <td key={m.id}>
                            <span className="score-dots">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <i
                                  key={n}
                                  className={
                                    state.progress[m.id]!.reflection![key] >= n
                                      ? m.color
                                      : ""
                                  }
                                />
                              ))}
                            </span>
                            <strong>
                              {state.progress[m.id]!.reflection![key]} / 5
                            </strong>
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <th>직접 남긴 생각</th>
                      {completed.map((m) => (
                        <td key={m.id} className="compare-note">
                          {state.progress[m.id]!.reflection!.note}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>다음에 해볼 일</th>
                      {completed.map((m) => (
                        <td key={m.id} className="compare-next">
                          {state.progress[m.id]!.reflection!.next}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <section className="compare-insight">
                <Lightbulb size={27} />
                <div>
                  <h2>흥미를 가장 높게 답한 체험의 다음 활동</h2>
                  <p>
                    {representative.length > 1
                      ? "같은 점수의 체험은 함께 보여드려요. 먼저 해볼 활동은 직접 골라보세요."
                      : "이번 회고에서 고른 후속 활동이에요."}{" "}
                    직무 적성을 판정하지 않아요.
                  </p>
                  <ul className="representative-actions">
                    {representative.map((id) => {
                      const saved = state.progress[id]!.reflection!;
                      return (
                        <li key={id}>
                          <strong>
                            {missions.find((m) => m.id === id)!.title}
                          </strong>
                          <span>{saved.next}</span>
                          {selectedActivity(saved) && (
                            <Link
                              className="text-button"
                              href={activityHref(selectedActivity(saved)!)}
                            >
                              {selectedActivity(saved)!.kind === "explore"
                                ? "선택한 직무 체험하기"
                                : "선택한 활동 안내 보기"}{" "}
                              <ChevronRight size={16} />
                            </Link>
                          )}
                          {saved.nextPlan && (
                            <small>
                              내 선택 이유: {saved.nextPlan.selectionReason}
                            </small>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <small>
                    체험 전 경험:{" "}
                    {profileAnswerLabel(state.profile, "experience")} · 탐색
                    목적: {profileAnswerLabel(state.profile, "purpose")}
                  </small>
                </div>
              </section>
              <button
                className="btn secondary"
                onClick={() => navigate("journal")}
              >
                나의 기록에서 다음 활동 확인하기
              </button>
            </>
          )}
        </main>
      )}
      {view === "guide" && (
        <main inert={!ready} className="wrap guide-page">
          <div className="page-intro">
            <h1>도움말</h1>
            <p>체험 방법과 기록·데이터 안내를 확인해요.</p>
          </div>
          <div className="guide-grid">
            <section>
              <h2>무엇을 체험하나요?</h2>
              <p>
                화면, 신청 규칙, 데이터, AI 검색, 접근 권한, 배포 판단까지 여섯
                직무의 핵심 로직을 짧게 체험해요. 모두 JavaScript로 시작해요.
              </p>
              <h2>처음부터 코드를 전부 짜야 하나요?</h2>
              <p>
                시작 코드와 예시 데이터가 준비돼 있어요. 변수, 조건문, 반복문,
                함수의 기초를 안다면 시작할 수 있어요. 문법 예제와 세 단계 힌트,
                참고 풀이도 제공해요.
              </p>
              <h2>체험이 어려워도 회고할 수 있나요?</h2>
              <p>
                코드를 한 번 이상 수정하고 실행했다면 모든 테스트를 통과하지
                않아도 회고를 남길 수 있어요. 힌트와 풀이 열람은 실력 감점으로
                사용하지 않아요.
              </p>
              <h2>결과로 적성을 알 수 있나요?</h2>
              <p>
                이번 작업에서 느낀 흥미와 어려움을 비교할 수 있어요. 짧은
                체험으로 직무 적성이나 취업 가능성을 판정하지 않아요. 전체
                분야의 실제 업무를 모두 경험하는 것도 아니에요.
              </p>
            </section>
            <section>
              <h2>작업은 어디에 저장되나요?</h2>
              <p>
                서버에 저장하고, 연결이 끊기면 이 브라우저에 초안을 보관해요.
                브라우저 쿠키로 기록을 구분해 같은 브라우저에서 이어할 수
                있어요. 다른 기기와 동기화되지는 않아요. 마지막 서버 저장부터
                30일이 지나면 기록을 불러오지 않고 매일 정리해요. 서버 기록이
                사라져도 기기 초안은 자동으로 다시 올리지 않아요. 초안 복구를
                선택하면 새로 30일 보관해요.
              </p>
              <h2>AI는 어떻게 사용하나요?</h2>
              <p>
                AI 연결과 동의가 있는 경우에만 현재 코드, 질문, 테스트 결과,
                선택한 경험 수준을 OpenAI에 보내 검수된 힌트 중 맞는 내용을
                골라요. AI가 연결되지 않아도 준비된 힌트로 모든 체험을 진행할 수
                있어요. 비밀키와 개인정보는 코드나 질문에 입력하지 마세요.
              </p>
              <label className="consent-inline">
                <input
                  type="checkbox"
                  checked={!!state.profile?.aiConsent}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      profile: {
                        ...normalizeProfile(s.profile),
                        aiConsent: e.target.checked,
                      },
                    }))
                  }
                />{" "}
                코드·질문·실행 결과를 OpenAI에 보내는 데 동의해요.
              </label>
              <p className="muted">
                현재 상태:{" "}
                {aiAvailable
                  ? "맞춤 힌트 사용 가능"
                  : "AI 연결 전 · 기본 힌트 사용 가능"}
              </p>
              <AnalyticsSettings analytics={analytics} />
              <h2>어떤 기기에서 이용할 수 있나요?</h2>
              <p>
                코드 체험은 데스크톱의 Chrome이나 Edge를 권장해요. 휴대폰에서는
                체험 소개와 기록을 확인할 수 있어요. 브라우저 데이터를 삭제하면
                이 기기의 초안은 사라져요.
              </p>
              <button
                className="btn secondary"
                onClick={() => navigate("home")}
              >
                체험실로 돌아가기
              </button>
            </section>
          </div>
        </main>
      )}
      {view !== "home" && view !== "work" && (
        <footer className="wrap site-footer">
          <span>
            해보기 <small>작게 해보고, 다음을 골라요.</small>
          </span>
          <button onClick={() => navigate("guide")}>이용 및 데이터 안내</button>
        </footer>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) setModal(null);
          }}
        >
          <section
            className={`modal ${modal === "reflection" ? "reflection-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close"
              disabled={deleting}
              aria-label="닫기"
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
            {modal === "reflection" && (
              <>
                <span className={`context-tag ${mission.color}`}>
                  <TrackIcon id={active} size={16} />
                  {mission.title} 회고
                </span>
                <h2 id="modal-title">해보니 어땠나요?</h2>
                <p>느낀 점을 짧게 남겨요.</p>
                <ProfileQuestions
                  profile={state.profile}
                  onAnswer={answerProfile}
                />
                <div className="reflection-ratings">
                  <Rating
                    label="이 작업이 흥미로웠나요?"
                    value={reflection.interest}
                    onChange={(n) => rateReflection("interest", n)}
                    low="별로였어요"
                    high="아주 흥미로웠어요"
                  />
                  <Rating
                    label="얼마나 어렵게 느껴졌나요?"
                    value={reflection.difficulty}
                    onChange={(n) => rateReflection("difficulty", n)}
                    low="쉬웠어요"
                    high="많이 어려웠어요"
                  />
                  <Rating
                    label="비슷한 작업을 다시 해보고 싶나요?"
                    value={reflection.again}
                    onChange={(n) => rateReflection("again", n)}
                    low="아직은 아니에요"
                    high="다시 해보고 싶어요"
                  />
                </div>
                <p
                  className="reflection-context-guide"
                  id="reflection-context-guide"
                >
                  흥미와 어려움은 따로 답해요. 문법이 낯설었는지, 작업의 조건을
                  판단하는 일이 어려웠는지도 적어주세요.
                </p>
                <label className="form-label">
                  {active === "data"
                    ? "눈여겨본 수치와 다음 행사 개선안"
                    : "재미있거나 막혔던 순간, 그리고 그 이유"}
                  <textarea
                    rows={3}
                    maxLength={2000}
                    aria-describedby="reflection-context-guide"
                    value={reflection.note}
                    onChange={(e) =>
                      setReflection((r) => ({ ...r, note: e.target.value }))
                    }
                    placeholder={
                      active === "data"
                        ? "예: 진로 참여율이 67%(3명 중 2명)였어요. 다음에는 행사 전에 알림을 보내보고 싶어요."
                        : "어떤 부분을 바꿀 때 재미있었나요? 어려웠던 이유는 무엇인가요?"
                    }
                  />
                </label>
                <fieldset
                  className="next-suggestions"
                  aria-describedby="next-action-explanation"
                >
                  <legend>다음에 해볼 작은 일</legend>
                  {nextSuggestion ? (
                    <>
                      <p
                        className="suggestion-reason"
                        id="next-action-explanation"
                      >
                        {nextSuggestion.reason}
                      </p>
                      {nextSuggestion.candidates.map((candidate) => (
                        <label className="next-option" key={candidate.id}>
                          <input
                            type="radio"
                            name="next-activity"
                            value={candidate.id}
                            checked={selectedNextId === candidate.id}
                            onChange={() => {
                              setSelectedNextId(candidate.id);
                              setNextReason("");
                              analytics.client.current?.track(
                                "next_action_selected",
                                {
                                  kind: candidate.kind,
                                  targetTrack: candidate.track,
                                },
                              );
                            }}
                          />
                          <span>{candidate.title}</span>
                        </label>
                      ))}
                    </>
                  ) : (
                    <p
                      className="suggestion-reason"
                      id="next-action-explanation"
                    >
                      세 가지 점수를 고르면 다음 활동을 제안해요.
                    </p>
                  )}
                </fieldset>
                {selectedNext && (
                  <label className="form-label">
                    이 활동을 고른 이유
                    <input
                      type="text"
                      value={nextReason}
                      maxLength={300}
                      onChange={(e) => setNextReason(e.target.value)}
                      placeholder="예: 재미있었지만 조건문을 더 연습하고 싶어서요."
                    />
                  </label>
                )}
                <p
                  className="reflection-prompt"
                  id="reflection-prompt"
                  role="status"
                >
                  {reflectionPrompt ||
                    "기록을 남기고 다른 체험과 비교해보세요."}
                </p>
                <button
                  className="btn primary full"
                  onClick={finishReflection}
                  aria-describedby="reflection-prompt"
                  disabled={!!reflectionPrompt}
                >
                  경험 기록하기
                </button>
              </>
            )}
            {modal === "reset" && (
              <>
                <h2 id="modal-title">처음 코드로 되돌릴까요?</h2>
                <p>
                  현재 수정한 코드와 실행 결과가 초기화돼요. 회고는 그대로
                  남아요. 필요한 코드는 먼저 내려받아주세요.
                </p>
                <div className="modal-actions">
                  <button
                    className="btn secondary"
                    onClick={() => setModal(null)}
                  >
                    취소
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => {
                      patch(
                        active,
                        changeCode(progress, mission.starter, "starter"),
                      );
                      setModal(null);
                    }}
                  >
                    처음 코드로 되돌리기
                  </button>
                </div>
              </>
            )}
            {modal === "solution" && (
              <>
                <h2 id="modal-title">참고 풀이를 살펴볼까요?</h2>
                <p>
                  풀이를 본 뒤 직접 한 줄씩 바꿔보세요. 열람 여부는 기록에
                  남지만 점수나 순위에 사용하지 않아요.
                </p>
                <div className="modal-actions">
                  <button
                    className="btn secondary"
                    onClick={() => setModal(null)}
                  >
                    더 생각해보기
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => {
                      analytics.client.current?.track("help_open", {
                        kind: "reference",
                      });
                      patch(active, {
                        ...changeCode(progress, mission.solution, "reference"),
                        usedSolution: true,
                      });
                      setModal(null);
                      toast(
                        "참고 풀이를 편집기에 불러왔어요. 실행하고 조건을 바꿔보세요.",
                      );
                    }}
                  >
                    참고 풀이 불러오기
                  </button>
                </div>
              </>
            )}
            {modal === "delete" && (
              <>
                {saveStatus.phase === "error" && (
                  <p role="alert">{saveStatus.message}</p>
                )}
                <h2 id="modal-title">모든 체험 기록을 삭제할까요?</h2>
                <p>
                  서버와 이 기기의 코드, 회고, 사전 질문 응답, AI 호출 정보를
                  삭제해요. 삭제한 기록은 복구할 수 없어요. 재저장 방지용 익명
                  표시와 오늘의 AI 사용 횟수는 잠시 유지해요.
                </p>
                <div className="modal-actions">
                  <button
                    className="btn secondary"
                    disabled={deleting}
                    onClick={() => setModal(null)}
                  >
                    취소
                  </button>
                  <button
                    className="btn danger"
                    onClick={erase}
                    disabled={deleting}
                  >
                    {deleting ? "삭제 중…" : "전체 기록 삭제"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
