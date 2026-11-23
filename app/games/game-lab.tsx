"use client";

import Link from "next/link";
import { useStoredLab } from "../use-stored-lab";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import {
  people,
  serviceSteps,
  backendState,
  advanceBackend,
  backendFeedback,
  entryNames,
  dataFeedback,
  notices,
  aiFeedback,
  accessPeople,
  accessFiles,
  accessNotes,
  permittedKeys,
  securityFeedback,
  serviceNames,
  demands,
  cloudFeedback,
  frontendFeedback,
} from "../../lib/game-rules";
import s from "./games.module.css";
import { AnalyticsSettings, useAnalytics } from "../analytics-settings";
import { GAME_ANALYTICS_VERSION } from "../../lib/analytics-schema";
import type { TrackId } from "../../lib/missions";
const GameCheckContext = createContext<(passed: boolean) => void>(() => {});

type PlayProps = { finish: () => void };
type Step = { label: string; done: boolean };
function Steps({ items }: { items: Step[] }) {
  return (
    <ol className={s.steps} aria-label="해볼 순서">
      {items.map((item, i) => (
        <li key={item.label} className={item.done ? s.done : ""}>
          <span aria-label={item.done ? "확인됨" : `${i + 1}단계`}>
            {item.done ? <Check size={14} /> : i + 1}
          </span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}
function Checkpoint({ error, finish }: PlayProps & { error: string }) {
  const record = useContext(GameCheckContext);
  const [checked, setChecked] = useState(false);
  return (
    <div className={s.check}>
      <button
        className="btn primary"
        onClick={() => {
          setChecked(true);
          record(!error);
          if (!error) finish();
        }}
      >
        결과 확인 <ArrowRight size={16} />
      </button>
      {checked && error && <p role="status">{error}</p>}
    </div>
  );
}
function Board({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={s.board} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Frontend({ finish }: PlayProps) {
  const [width, setWidth] = useState(70),
    [wrap, setWrap] = useState(false),
    [zoom, setZoom] = useState(false);
  return (
    <>
      <Board title="축제 신청 화면">
        <div className={s.phone}>
          <small>내 신청 내역</small>
          <h3>야외 영화제</h3>
          <p>금요일 저녁 7시</p>
          <div className={s.buttonArea}>
            <span
              className={s.sample}
              style={{
                width,
                fontSize: zoom ? 28 : 14,
                whiteSpace: wrap ? "normal" : "nowrap",
              }}
            >
              영화제 신청 취소
            </span>
          </div>
          <small>점선 안의 너비는 120px예요.</small>
        </div>
      </Board>
      <section className={s.tools}>
        <h2>이렇게 해봐요</h2>
        <Steps
          items={[
            { label: "큰 글자로 잘리는 부분 확인", done: zoom },
            { label: "너비를 120px 이하로 맞추기", done: width <= 120 },
            { label: "줄바꿈을 켜서 이름 전부 보이기", done: wrap },
          ]}
        />
        <label className={s.option}>
          <input
            type="checkbox"
            checked={zoom}
            onChange={(e) => setZoom(e.target.checked)}
          />{" "}
          큰 글자로 확인
        </label>
        <label>
          버튼 너비 · {width}px
          <input
            type="range"
            min="55"
            max="200"
            value={width}
            onChange={(e) => setWidth(+e.target.value)}
          />
        </label>
        <button onClick={() => setWidth(120)}>120px로 맞추기</button>
        <label className={s.option}>
          <input
            type="checkbox"
            checked={wrap}
            onChange={(e) => setWrap(e.target.checked)}
          />{" "}
          줄바꿈 허용
        </label>
        <Checkpoint
          error={frontendFeedback(width, wrap, zoom)}
          finish={finish}
        />
      </section>
    </>
  );
}
function Backend({ finish }: PlayProps) {
  const [locked, setLocked] = useState(false),
    [turns, setTurns] = useState<number[]>([]);
  const [observed, setObserved] = useState(false);
  const { progress, allowed, tickets, seats, busy } = backendState(turns);
  const oversold = tickets.filter(Boolean).length > 1;
  return (
    <>
      <Board title={`접수 창구 · 남은 자리 ${seats}개`}>
        <p className={s.readout}>
          처리 {turns.length} / 6단계 · 발급한 표{" "}
          {tickets.filter(Boolean).length}장
        </p>
        {people.map((name, i) => (
          <div className={s.row} key={name}>
            <Ticket size={19} />
            <strong>{name}</strong>
            <span>
              {tickets[i]
                ? "표 받음"
                : progress[i] && !allowed[i]
                  ? "마감"
                  : "대기 중"}
            </span>
            <button
              aria-label={`${name} ${serviceSteps[progress[i]] ?? "처리 끝"}`}
              disabled={
                progress[i] === 3 || (locked && busy >= 0 && busy !== i)
              }
              onClick={() => setTurns(advanceBackend(turns, i, locked))}
            >
              {serviceSteps[progress[i]] ?? "처리 끝"}
            </button>
          </div>
        ))}
        <p className={s.readout}>
          {locked && busy >= 0
            ? `${people[busy]}의 처리가 끝날 때까지 다른 창구는 기다려요.`
            : "자리를 확인한 순간에는 아직 표가 발급되지 않아요."}
        </p>
        {oversold && (
          <p className={s.warning} role="status">
            표 한 장인데 두 사람이 표를 받았어요.
          </p>
        )}
        <details>
          <summary>지금까지 처리한 순서</summary>
          <p>
            {turns
              .map(
                (who, i) =>
                  `${people[who]}(${serviceSteps[turns.slice(0, i).filter((v) => v === who).length]})`,
              )
              .join(" → ") || "시작 전"}
          </p>
        </details>
      </Board>
      <section className={s.tools}>
        <h2>이렇게 해봐요</h2>
        <Steps
          items={[
            { label: "두 신청이 겹치는 상황 보기", done: observed },
            { label: "한 사람씩 처리하며 다시 시작", done: locked },
            {
              label: "두 사람의 신청을 끝까지 처리",
              done: locked && turns.length === 6,
            },
          ]}
        />
        <button
          onClick={() => {
            setObserved(true);
            setLocked(false);
            setTurns([0, 1, 0, 1, 0, 1]);
          }}
        >
          두 사람이 동시에 신청하면?
        </button>
        <button
          disabled={!observed}
          onClick={() => {
            setLocked(true);
            setTurns([]);
          }}
        >
          한 사람씩 처리하며 다시 시작
        </button>
        <p className={s.tip}>
          다시 시작한 뒤 민지 창구 버튼을 세 번, 준호 창구 버튼을 세 번
          눌러보세요. 반대 순서도 괜찮아요.
        </p>
        <Checkpoint
          error={
            !observed
              ? "‘두 사람이 동시에 신청하면?’을 먼저 눌러보세요."
              : backendFeedback(turns, locked)
          }
          finish={finish}
        />
      </section>
    </>
  );
}
function Data({ finish }: PlayProps) {
  const [keep, setKeep] = useState(entryNames.map(() => true));
  const count = keep.filter(Boolean).length;
  return (
    <>
      <Board title="입장 기록">
        <p className={s.readout}>체크한 기록만 방문자 수에 넣어요.</p>
        {entryNames.map((name, i) => (
          <label className={`${s.row} ${s.option}`} key={i}>
            <input
              aria-label={`${name} 10:0${i} 기록 포함`}
              type="checkbox"
              checked={keep[i]}
              onChange={() => setKeep(keep.map((v, j) => (j === i ? !v : v)))}
            />
            <time>10:0{i}</time>
            <strong>{name}</strong>
            <span>{keep[i] ? "집계" : "제외"}</span>
          </label>
        ))}
        <output className={s.number} aria-live="polite">
          현재 집계 {count}명
        </output>
      </Board>
      <section className={s.tools}>
        <h2>이렇게 해봐요</h2>
        <Steps
          items={[
            { label: "민지의 첫 입장만 남기기", done: keep[0] && !keep[2] },
            { label: "준호의 첫 입장만 남기기", done: keep[1] && !keep[4] },
            { label: "한 번 입장한 서연은 그대로 두기", done: keep[3] },
          ]}
        />
        <p className={s.tip}>
          같은 이름이 두 번 나오면 뒤의 체크를 꺼보세요. 기록은 5건이지만 실제
          사람은 3명이에요.
        </p>
        <Checkpoint error={dataFeedback(keep)} finish={finish} />
      </section>
    </>
  );
}
function AI({ finish }: PlayProps) {
  const [source, setSource] = useState<number | null>(null),
    [time, setTime] = useState(""),
    [place, setPlace] = useState("");
  return (
    <>
      <Board title="안내 봇의 공지 서랍">
        <p className={s.bubble}>“이번 주 영화제는 언제 어디서 해?”</p>
        {notices.map((n, i) => (
          <button
            className={s.notice}
            key={n.title}
            aria-pressed={source === i}
            onClick={() => {
              setSource(i);
              setTime("");
              setPlace("");
            }}
          >
            <strong>{n.title}</strong>
            <span>
              {n.time} · {n.place}
            </span>
          </button>
        ))}
        <output className={s.answer} aria-live="polite">
          {time || "[시간]"}에 {place || "[장소]"}에서 열려요.
        </output>
      </Board>
      <section className={s.tools}>
        <h2>이렇게 해봐요</h2>
        <Steps
          items={[
            { label: "이번 주 영화제 공지를 고르기", done: source === 1 },
            {
              label: "그 공지에 적힌 시간 선택",
              done: source === 1 && time === notices[1].time,
            },
            {
              label: "그 공지에 적힌 장소 선택",
              done: source === 1 && place === notices[1].place,
            },
          ]}
        />
        <p className={s.tip}>
          {source === null
            ? "공지 중 한 장을 먼저 눌러주세요."
            : `지금 참고하는 공지: ${notices[source].title}`}
        </p>
        <label>
          시간
          <select
            value={time}
            disabled={source === null}
            onChange={(e) => setTime(e.target.value)}
          >
            <option value="">시간 고르기</option>
            {["오후 5시", "오후 6시", "오후 7시"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          장소
          <select
            value={place}
            disabled={source === null}
            onChange={(e) => setPlace(e.target.value)}
          >
            <option value="">장소 고르기</option>
            {["강당", "운동장", "학생회관"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <Checkpoint error={aiFeedback(source, time, place)} finish={finish} />
      </section>
    </>
  );
}
function Security({ finish }: PlayProps) {
  const [keys, setKeys] = useState<number[]>([]);
  return (
    <>
      <Board title="자료실 출입문">
        <p className={s.readout}>버튼을 누르면 열리고, 다시 누르면 잠겨요.</p>
        {accessPeople.map((person, i) => (
          <section className={s.accessPerson} key={person}>
            <h3>{person}</h3>
            <p>{accessNotes[i]}</p>
            <div className={s.keys}>
              {accessFiles.map((file, j) => {
                const id = i * 3 + j,
                  open = keys.includes(id);
                return (
                  <button
                    key={file}
                    aria-label={`${person} ${file}`}
                    aria-pressed={open}
                    onClick={() =>
                      setKeys(
                        open ? keys.filter((v) => v !== id) : [...keys, id],
                      )
                    }
                  >
                    {open ? "열림" : "잠김"} · {file}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </Board>
      <section className={s.tools}>
        <h2>이렇게 해봐요</h2>
        <Steps
          items={accessPeople.map((person, i) => ({
            label: `${person}에게 필요한 자료만 열기`,
            done: accessFiles.every(
              (_, j) =>
                keys.includes(i * 3 + j) === permittedKeys.includes(i * 3 + j),
            ),
          }))}
        />
        <p className={s.tip}>
          먼저 세 사람의 ‘행사 일정’을 모두 열어보세요. 이어 참가자의 ‘내
          입장권’, 접수 담당자의 ‘전체 명단’을 열어요.
        </p>
        <Checkpoint error={securityFeedback(keys)} finish={finish} />
      </section>
    </>
  );
}
function Cloud({ finish }: PlayProps) {
  const [units, setUnits] = useState([1, 1, 1]);
  const spare = 6 - units.reduce((a, b) => a + b, 0);
  return (
    <>
      <Board title="축제 서버 관제실">
        {serviceNames.map((name, i) => {
          const capacity = units[i] * 8,
            waiting = Math.max(0, demands[i] - capacity);
          return (
            <section className={s.service} key={name}>
              <h3>{name}</h3>
              <p>
                분당 요청 {demands[i]}건 · 현재 처리 가능 {capacity}건
              </p>
              <div className={s.row}>
                <progress
                  aria-label={`${name} 처리된 요청`}
                  value={demands[i] - waiting}
                  max={demands[i]}
                />
                <span className={waiting ? s.waiting : s.clear}>
                  대기 {waiting}건
                </span>
              </div>
              <div className={s.keys}>
                <button
                  aria-label={`${name} 서버 줄이기`}
                  disabled={units[i] === 0}
                  onClick={() =>
                    setUnits(units.map((v, j) => v - Number(i === j)))
                  }
                >
                  −
                </button>
                <span>서버 {units[i]}대</span>
                <button
                  aria-label={`${name} 서버 늘리기`}
                  disabled={spare === 0}
                  onClick={() =>
                    setUnits(units.map((v, j) => v + Number(i === j)))
                  }
                >
                  ＋
                </button>
              </div>
            </section>
          );
        })}
      </Board>
      <section className={s.tools}>
        <h2>이렇게 해봐요</h2>
        <Steps
          items={serviceNames.map((name, i) => ({
            label: `${name} 창구 대기 없애기`,
            done: units[i] * 8 >= demands[i],
          }))}
        />
        <p className={s.tip}>
          서버 1대는 분당 8건을 처리해요. 대기가 남은 창구의 ＋를 누르면 바로
          줄어드는 걸 볼 수 있어요. 잘못 옮겼다면 −로 돌려받아요.
        </p>
        <output className={s.number} aria-live="polite">
          더 배치할 수 있는 서버 {spare}대
        </output>
        <Checkpoint error={cloudFeedback(units)} finish={finish} />
      </section>
    </>
  );
}
const games = [
  {
    id: "frontend",
    scene: "신청 화면 준비",
    next: "신청 화면이 열렸어요. 곧 신청이 몰려와요.",
    role: "프론트엔드",
    name: "작은 화면 수리하기",
    summary: "큰 글자도 잘리지 않게 버튼 고치기",
    intro: "큰 글자로 바꿔보고, 버튼 이름이 끝까지 보이도록 고쳐봐요.",
    learned:
      "글자 크기가 달라도 내용을 읽고 누를 수 있도록 화면을 다듬는 일이에요.",
    icon: LayoutTemplate,
    play: Frontend,
  },
  {
    id: "backend",
    scene: "신청 오픈",
    next: "표 처리는 안전해졌어요. 그런데 신청이 계속 몰려와요.",
    role: "백엔드",
    name: "마지막 표 한 장",
    summary: "동시 신청에도 표 한 장만 발급하기",
    intro:
      "‘두 사람이 동시에 신청하면?’을 눌러 표가 중복 발급되는 상황부터 봐요.",
    learned:
      "확인부터 발급까지 한 번에 처리하면 동시에 신청해도 마지막 한 자리를 지킬 수 있어요.",
    icon: Ticket,
    play: Backend,
  },
  {
    id: "cloud",
    scene: "신청 폭주",
    next: "서비스가 버텼어요. 이제 행사 전날 정리가 남았어요.",
    role: "클라우드/SRE",
    name: "신청 대기 줄 없애기",
    summary: "서버를 옮겨 바쁜 창구의 대기 줄이기",
    intro: "대기가 남은 창구의 ＋를 눌러 서버를 한 대씩 더 배치해봐요.",
    learned:
      "정해진 자원 안에서 바쁜 곳에 서버를 더 배치하고 대기가 줄었는지 확인하는 일이에요.",
    icon: Server,
    play: Cloud,
  },
  {
    id: "security",
    scene: "행사 전날",
    next: "권한 정리가 끝났어요. 행사 당일 문의가 들어와요.",
    role: "보안 엔지니어",
    name: "필요한 문만 열기",
    summary: "사람마다 필요한 자료만 열어주기",
    intro:
      "먼저 모두에게 행사 일정을 열고, 각자의 업무에 필요한 자료만 더 열어요.",
    learned:
      "사람마다 필요한 자료만 볼 수 있게 정하는 일이에요. 넓은 권한이 항상 좋은 건 아니에요.",
    icon: ShieldCheck,
    play: Security,
  },
  {
    id: "ai",
    scene: "행사 당일 문의",
    next: "안내 봇이 정확히 답해요. 입장이 시작돼요.",
    role: "AI 엔지니어",
    name: "근거를 보고 답하는 봇",
    summary: "질문에 맞는 공지를 골라 답하기",
    intro: "질문의 ‘이번 주’와 ‘영화제’가 모두 맞는 공지 한 장부터 골라봐요.",
    learned:
      "질문에 맞는 자료를 고르고 그 내용과 답변을 대조해야 엉뚱한 안내를 줄일 수 있어요.",
    icon: BrainCircuit,
    play: AI,
  },
  {
    id: "data",
    scene: "입장 후 정산",
    next: "행사가 끝났어요. 오늘 하루를 함께 운영했어요.",
    role: "데이터 분석",
    name: "실제 방문자 세기",
    summary: "재입장을 빼고 실제 방문자 세기",
    intro: "같은 사람의 재입장 기록을 빼서 실제 방문자 수를 찾아봐요.",
    learned:
      "기록 수와 사람 수는 다를 수 있어요. 무엇을 한 건으로 셀지 먼저 정하는 일이에요.",
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
