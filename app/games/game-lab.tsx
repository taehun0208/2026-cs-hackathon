"use client";

import Link from "next/link";
import { useStoredLab } from "../use-stored-lab";
import { useEffect, useRef, useState } from "react";
import {
  LayoutTemplate,
  Ticket,
  ChartColumn,
  BrainCircuit,
  ShieldCheck,
  Server,
  ArrowRight,
  ArrowLeft,
  FlaskConical,
  Check,
} from "lucide-react";
import s from "./games.module.css";
import { AnalyticsSettings, useAnalytics } from "../analytics-settings";
import { GAME_ANALYTICS_VERSION } from "../../lib/analytics-schema";
import type { TrackId } from "../../lib/missions";
import { GameCheckContext } from "./shared";
import { AI, Backend, Cloud, Data, Frontend, Security } from "./plays";

const games = [
  {
    id: "frontend",
    scene: "신청 화면 준비",
    next: "신청 화면이 열렸어요. 곧 신청이 몰려와요.",
    role: "프론트엔드",
    name: "작은 화면 수리하기",
    summary: "여러 상황에서 버튼 이름이 안 잘리게 하기",
    intro:
      "글자 크기와 칸 너비가 달라도 버튼 이름이 끝까지 보이도록 속성을 골라봐요.",
    learned:
      "한 화면만이 아니라 글자 크기, 칸 너비, 이름 길이가 달라져도 내용을 읽고 누를 수 있게 만드는 일이에요.",
    icon: LayoutTemplate,
    play: Frontend,
  },
  {
    id: "backend",
    scene: "신청 오픈",
    next: "표 처리는 안전해졌어요. 이제 신청 서비스의 새 버전을 배포할 시간이에요.",
    role: "백엔드",
    name: "마지막 표 한 장",
    summary: "표가 겹치는 순서를 찾고 고치기",
    intro:
      "표가 두 장 발급되는 순서를 직접 찾아보고, 어떻게 고쳐야 모든 순서에서 안전한지 확인해요.",
    learned:
      "자리 확인과 차감이 따로 놀면 동시에 신청할 때 표가 겹쳐요. 한 사람씩 처리해 한 덩어리로 묶어야 마지막 한 자리를 지킬 수 있어요.",
    icon: Ticket,
    play: Backend,
  },
  {
    id: "cloud",
    scene: "새 버전 배포",
    next: "배포 판단이 끝났어요. 이제 행사 전날 정리가 남았어요.",
    role: "클라우드/SRE",
    name: "새 버전, 계속 배포할까?",
    summary: "지표를 보고 기다릴지 되돌릴지 정하기",
    intro:
      "새 버전을 일부 사용자에게 먼저 공개했어요. 오류율과 응답 시간을 보고 기다릴지, 되돌릴지, 계속할지 정해봐요.",
    learned:
      "숫자를 보고 기다릴지, 되돌릴지, 계속할지 정하는 일이에요. 관측이 충분한지부터 확인해요.",
    icon: Server,
    play: Cloud,
  },
  {
    id: "security",
    scene: "행사 전날",
    next: "권한 정리가 끝났어요. 행사 당일 문의가 들어와요.",
    role: "보안 엔지니어",
    name: "이 요청, 열어줄까?",
    summary: "요청마다 허용·거부를 판정하기",
    intro:
      "신청 내역을 보려는 요청이 들어와요. 허용할지, 로그인을 요구할지, 막을지 판정해봐요.",
    learned:
      "요청마다 로그인과 소유자를 확인해 허용과 거부를 정하는 일이에요. 관리자도 모든 걸 할 수 있는 건 아니에요.",
    icon: ShieldCheck,
    play: Security,
  },
  {
    id: "ai",
    scene: "행사 당일 문의",
    next: "안내 봇이 정확히 답해요. 입장이 시작돼요.",
    role: "AI 엔지니어",
    name: "봇 답변 채점하기",
    summary: "봇 답변이 근거와 맞는지 채점하기",
    intro:
      "안내 봇의 답변이 찾아온 공지와 맞는지 채점해봐요. 근거에 없는 내용을 지어낸 답도 섞여 있어요.",
    learned:
      "답변이 근거와 맞는지 확인하고, 근거가 없으면 모른다고 말하게 만드는 일이에요.",
    icon: BrainCircuit,
    play: AI,
  },
  {
    id: "data",
    scene: "입장 후 정산",
    next: "행사가 끝났어요. 오늘 하루를 함께 운영했어요.",
    role: "데이터 분석",
    name: "무엇을 셀까?",
    summary: "같은 기록도 질문에 따라 다르게 세기",
    intro:
      "같은 입장 기록으로 방문자 수, 게이트 통과 횟수, 재입장 횟수를 각각 구해봐요.",
    learned:
      "같은 기록도 질문에 따라 세는 기준이 달라져요. 무엇을 한 건으로 셀지 먼저 정하는 일이에요.",
    icon: ChartColumn,
    play: Data,
  },
] satisfies {
  id: TrackId;
  scene: string;
  next: string;
  role: string;
  name: string;
  summary: string;
  intro: string;
  learned: string;
  icon: typeof LayoutTemplate;
  play: typeof Frontend;
}[];
export default function GameLab({ initialTrack }: { initialTrack?: TrackId }) {
  const { state, setState, status, controller } = useStoredLab();
  const entryHandled = useRef("");
  const [locationVersion, setLocationVersion] = useState(0);
  // State loading establishes the guest cookie before analytics reads it.
  const analytics = useAnalytics(status.phase !== "loading");
  const ready = status.ready && analytics.status.phase !== "loading";
  useEffect(() => {
    if (analytics.status.enabled)
      analytics.client.current?.track("page_view", { page: "games" });
  }, [analytics.status.token]);
  const [game, setGame] = useState<number | null>(null),
    [won, setWon] = useState(false),
    [attempt, setAttempt] = useState(0);
  const done = games.filter((g) => state.games?.[g.id]);
  const nextIndex = games.findIndex((g) => !state.games?.[g.id]);
  const current = game === null ? null : games[game],
    Play = current?.play,
    following = game === null ? undefined : games[game + 1];
  const choose = (
    i: number | null,
    replay = false,
    mode: "push" | "replace" = "push",
  ) => {
    if (!ready) return;
    const url = new URL(window.location.href);
    if (i === null) url.searchParams.delete("track");
    else url.searchParams.set("track", games[i].id);
    if (url.href !== window.location.href)
      window.history[mode === "push" ? "pushState" : "replaceState"](
        null,
        "",
        url,
      );
    entryHandled.current = url.href;
    const reviewing = i !== null && !replay && !!state.games?.[games[i].id];
    if (i === null || reviewing) analytics.client.current?.end("left");
    else
      analytics.client.current?.begin(
        games[i].id,
        "game",
        GAME_ANALYTICS_VERSION,
        "new",
      );
    setGame(i);
    setWon(i !== null && !replay && !!state.games?.[games[i].id]);
    setAttempt((v) => v + 1);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  useEffect(() => {
    const changed = () => setLocationVersion((value) => value + 1);
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  useEffect(() => {
    if (!ready || entryHandled.current === window.location.href) return;
    const track = new URL(window.location.href).searchParams.get("track");
    const index = games.findIndex((g) => g.id === track);
    choose(index < 0 ? null : index, false, "replace");
  }, [initialTrack, ready, locationVersion]);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "haebogi-records.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <header className="site-header game-header">
        <div className="nav-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <FlaskConical size={23} />
            </span>
            <span>해보기</span>
          </Link>
          <Link className="btn secondary compact" href="/">
            코드 체험하기
          </Link>
          <Link className="btn secondary compact" href="/?view=journal">
            나의 기록
          </Link>
        </div>
      </header>
      <section
        className={`storage-banner ${["error", "recovery", "conflict"].includes(status.phase) ? "" : "game-save-status"}`}
        aria-label="게임 기록 저장 안내"
      >
        <div role="status">
          <strong>
            {status.message ||
              {
                loading: "기록을 불러오고 있어요.",
                idle: "게임을 마치면 자동으로 기록해요.",
                saving: "게임 기록을 저장하고 있어요.",
                saved: "기록을 저장했어요.",
                deleting: "기록을 삭제하고 있어요.",
                error: "저장을 다시 시도해주세요.",
                recovery: "초안을 확인해주세요.",
                conflict: "겹친 변경을 확인해주세요.",
              }[status.phase]}
          </strong>
          {status.localSaved && status.phase !== "saved" && (
            <p>이 브라우저에 초안을 보관하고 있어요.</p>
          )}
          {!status.localSaved && status.ready && status.phase !== "idle" && (
            <p>
              기기 초안을 보관하지 못했어요. 서버 저장 완료를 확인하거나 기록을
              내려받아주세요.
            </p>
          )}
        </div>
        <div className="storage-actions">
          {!!status.pendingDrafts && status.ready && (
            <button
              className="btn secondary compact"
              onClick={() => void controller.current?.recoverNextDraft()}
            >
              남은 초안 {status.pendingDrafts}개 확인
            </button>
          )}
          {status.phase === "error" && (
            <button
              className="btn primary compact"
              onClick={() => void controller.current?.retry()}
            >
              다시 시도
            </button>
          )}
          {status.phase === "recovery" && (
            <button
              className="btn primary compact"
              onClick={() => void controller.current?.restore()}
            >
              초안 복구해 저장
            </button>
          )}
          {status.phase === "conflict" &&
            (status.canResolve ? (
              <>
                <button
                  className="btn primary compact"
                  onClick={() =>
                    void controller.current?.resolveConflict("local")
                  }
                >
                  겹친 부분은 이 탭 내용 유지
                </button>
                <button
                  className="btn secondary compact"
                  onClick={() =>
                    void controller.current?.resolveConflict("remote")
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
            ))}
          {["error", "recovery", "conflict"].includes(status.phase) && (
            <>
              <button className="btn secondary compact" onClick={download}>
                기록 내려받기
              </button>
              <Link className="btn secondary compact" href="/?view=journal">
                기록 관리 열기
              </Link>
            </>
          )}
        </div>
      </section>
      {status.ready && analytics.status.phase === "loading" && (
        <div className="loading-strip" role="status">
          참여 설정을 확인하고 있어요.
        </div>
      )}
      <main inert={!ready} className={`wrap ${s.main}`}>
        {current && (
          <button className={s.back} onClick={() => choose(null)}>
            <ArrowLeft size={16} /> 직무 목록
          </button>
        )}
        <div className={s.heading}>
          <div>
            {current && <p className={s.role}>{current.role}</p>}
            <h1>{current?.name ?? "코드 없이 직무 둘러보기"}</h1>
            <p className={s.lead}>
              {current
                ? won
                  ? "방금 해본 일이 이 직무에서 어떤 의미인지 살펴봐요."
                  : current.intro
                : "교내 축제를 운영하며, 여섯 직무가 하는 일을 가볍게 경험해요."}
            </p>
          </div>
          {!current && done.length > 0 && (
            <p className={s.progress} role="status">
              <Check size={16} /> {done.length}개 직무를 해봤어요
            </p>
          )}
        </div>
        {!current && (
          <>
            <div className={s.catalog}>
              {games.map((g, i) => (
                <button
                  key={g.role}
                  aria-label={`${g.role} 게임 시작`}
                  aria-describedby={`game-scene-${g.id}`}
                  onClick={() => choose(i)}
                >
                  <span className={s.cardIcon} aria-hidden="true">
                    <g.icon size={25} strokeWidth={1.7} />
                  </span>
                  <span className={s.cardRole} id={`game-scene-${g.id}`}>
                    {i + 1}. {g.scene} · {g.role}
                    {i === nextIndex && " · 다음 추천"}
                  </span>
                  <strong>{g.name}</strong>
                  <span className={s.cardDescription}>{g.summary}</span>
                  <span className={s.cardAction}>
                    {state.games?.[g.id] ? "결과와 흥미 보기" : "해보기"}
                    {state.games?.[g.id] ? (
                      <Check size={16} />
                    ) : (
                      <ArrowRight size={16} />
                    )}
                  </span>
                </button>
              ))}
            </div>
            {done.length === games.length && (
              <section className={s.complete} role="status">
                <h2>축제 하루를 함께 운영했어요!</h2>
                <ul className={s.recap}>
                  {games.map((g) => (
                    <li key={g.id}>
                      <strong>{g.role}</strong> {g.learned}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className={s.footnote}>
              게임 완료와 흥미 평가는 이 브라우저의 기록으로 저장돼요. 나의
              기록과 비교하기에서 다시 볼 수 있고, 코드 체험 회고와는 따로
              표시해요.
            </p>
          </>
        )}
        {Play && !won && (
          <div className={s.layout}>
            <GameCheckContext.Provider
              value={(passed) =>
                analytics.client.current?.track("game_check", { passed })
              }
            >
              <Play
                key={attempt}
                finish={() => {
                  if (current)
                    setState((previous) => {
                      const now = new Date().toISOString();
                      return {
                        ...previous,
                        games: {
                          ...previous.games,
                          [current.id]: {
                            ...previous.games?.[current.id],
                            version: 1,
                            completedAt:
                              previous.games?.[current.id]?.completedAt ?? now,
                            updatedAt: now,
                          },
                        },
                      };
                    });
                  analytics.client.current?.end("completed");
                  setWon(true);
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
              />
            </GameCheckContext.Provider>
          </div>
        )}
        {won && current && (
          <section className={s.complete} aria-labelledby="game-complete-title">
            <span className={s.completeIcon} aria-hidden="true">
              <Check size={27} />
            </span>
            <h2 id="game-complete-title">작은 업무 하나를 해봤어요</h2>

            <p>{current.learned}</p>
            <p>{current.next}</p>
            <fieldset className={s.rating}>
              <legend>
                이 일을 해보니 얼마나 흥미로웠나요? <small>(선택)</small>
              </legend>
              <div>
                {[1, 2, 3, 4, 5].map((score) => (
                  <label key={score}>
                    <input
                      type="radio"
                      name="game-interest"
                      value={score}
                      checked={state.games?.[current.id]?.interest === score}
                      onChange={() =>
                        setState((previous) => {
                          const record = previous.games?.[current.id];
                          if (!record) return previous;
                          return {
                            ...previous,
                            games: {
                              ...previous.games,
                              [current.id]: {
                                ...record,
                                interest: score,
                                updatedAt: new Date().toISOString(),
                              },
                            },
                          };
                        })
                      }
                    />{" "}
                    {score}점
                  </label>
                ))}
              </div>
              <small>1점 별로 흥미롭지 않음 · 5점 매우 흥미로움</small>
            </fieldset>
            <div className={s.keys}>
              {following && (
                <button
                  className="btn primary"
                  onClick={() => choose(game! + 1)}
                >
                  다음 장면: {following.role} <ArrowRight size={16} />
                </button>
              )}
              <Link className="btn secondary" href={`/?track=${current.id}`}>
                같은 직무 코드로 해보기 <ArrowRight size={16} />
              </Link>
              <Link className="btn secondary" href="/?view=compare">
                내 흥미 비교하기
              </Link>
              <button
                className="btn secondary"
                onClick={() => choose(game, true)}
              >
                한 번 더 해보기
              </button>
              <button className="btn secondary" onClick={() => choose(null)}>
                {done.length === games.length
                  ? "하루 정리 보기"
                  : "다른 직무 고르기"}
              </button>
            </div>
          </section>
        )}
        <section className={s.preferences} aria-label="체험 개선 설정">
          <AnalyticsSettings analytics={analytics} />
        </section>
      </main>
    </>
  );
}
