"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { Ticket } from "lucide-react";
import s from "./games.module.css";
import { Board, Checkpoint, GameCheckContext, type PlayProps } from "./shared";
import { Rounds } from "./rounds";
import {
  people,
  serviceSteps,
  backendState,
  oversold,
  backendFixes,
  countOversold,
  allBackendOrders,
  visits,
  countVisits,
  type BackendFix,
} from "../../lib/game-rules";
import {
  aiRounds,
  cloudRounds,
  dataRounds,
  securityRounds,
} from "../../lib/game-rounds";

type Fit = "nowrap" | "normal";
const scenes = [
  {
    label: "기본 글자 · 넓은 칸",
    text: "영화제 신청 취소",
    size: 14,
    cell: 220,
  },
  {
    label: "큰 글자(200%) · 넓은 칸",
    text: "영화제 신청 취소",
    size: 28,
    cell: 220,
  },
  {
    label: "기본 글자 · 좁은 칸",
    text: "영화제 신청 취소",
    size: 14,
    cell: 120,
  },
  {
    label: "큰 글자 · 좁은 칸 · 긴 이름",
    text: "야외 영화제 신청 취소 확인",
    size: 28,
    cell: 120,
  },
];
export function Frontend({ finish }: PlayProps) {
  const [wrap, setWrap] = useState<Fit>("nowrap"),
    [fit, setFit] = useState<"fixed" | "fill">("fixed"),
    [auto, setAuto] = useState<"fixed" | "auto">("fixed"),
    [cut, setCut] = useState<boolean[]>(scenes.map(() => false));
  const buttons = useRef<(HTMLSpanElement | null)[]>([]);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const measure = () =>
      setCut(
        scenes.map((_, i) => {
          const b = buttons.current[i],
            c = cells.current[i];
          if (!b || !c) return false;
          return (
            b.scrollWidth > b.clientWidth ||
            b.scrollHeight > b.clientHeight ||
            b.getBoundingClientRect().right >
              c.getBoundingClientRect().right + 0.5
          );
        }),
      );
    measure();
    document.fonts?.ready.then(measure);
  }, [wrap, fit, auto]);
  const failing = cut.filter(Boolean).length;
  return (
    <>
      <Board title="신청 취소 버튼 · 4가지 상황">
        <div className={s.scenes}>
          {scenes.map((scene, i) => (
            <figure key={scene.label} className={s.scene}>
              <figcaption>{scene.label}</figcaption>
              <div
                className={s.cell}
                style={{ width: scene.cell }}
                ref={(el) => {
                  cells.current[i] = el;
                }}
              >
                <span
                  className={s.sample}
                  ref={(el) => {
                    buttons.current[i] = el;
                  }}
                  style={{
                    fontSize: scene.size,
                    whiteSpace: wrap,
                    overflowWrap: "normal",
                    width: fit === "fixed" ? 160 : "100%",
                    height: auto === "fixed" ? 32 : "auto",
                  }}
                >
                  {scene.text}
                </span>
              </div>
              <small className={cut[i] ? s.waiting : s.clear}>
                {cut[i] ? "잘리거나 넘쳐요" : "끝까지 보여요"}
              </small>
            </figure>
          ))}
        </div>
      </Board>
      <section className={s.tools}>
        <h2>모든 상황에서 이름이 보이게 하세요</h2>
        <p className={s.tip}>
          속성을 바꾸면 4가지 상황이 함께 바뀌어요. 현재 잘리는 상황 {failing}
          개.
        </p>
        <fieldset className={s.choices}>
          <legend>글자 줄바꿈</legend>
          {(
            [
              ["nowrap", "한 줄로 유지"],
              ["normal", "줄바꿈 허용"],
            ] as const
          ).map(([v, label]) => (
            <label className={s.option} key={v}>
              <input
                type="radio"
                name="wrap"
                checked={wrap === v}
                onChange={() => setWrap(v)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className={s.choices}>
          <legend>버튼 너비</legend>
          {(
            [
              ["fixed", "160px로 고정"],
              ["fill", "칸 너비에 맞춤"],
            ] as const
          ).map(([v, label]) => (
            <label className={s.option} key={v}>
              <input
                type="radio"
                name="fit"
                checked={fit === v}
                onChange={() => setFit(v)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className={s.choices}>
          <legend>버튼 높이</legend>
          {(
            [
              ["fixed", "32px로 고정"],
              ["auto", "내용에 맞춤"],
            ] as const
          ).map(([v, label]) => (
            <label className={s.option} key={v}>
              <input
                type="radio"
                name="height"
                checked={auto === v}
                onChange={() => setAuto(v)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <Checkpoint
          error={
            failing ? `아직 이름이 잘리는 상황이 ${failing}개 남아 있어요.` : ""
          }
          finish={finish}
        />
      </section>
    </>
  );
}

export function Backend({ finish }: PlayProps) {
  const record = useContext(GameCheckContext);
  const [turns, setTurns] = useState<number[]>([]),
    [hint, setHint] = useState(false),
    [fix, setFix] = useState<BackendFix | null>(null),
    [tested, setTested] = useState<BackendFix | null>(null);
  const { progress, allowed, tickets, seats } = backendState(turns);
  const found = oversold(turns);
  const stuck = turns.length === 6 && !found;
  const broken = tested ? countOversold(tested) : 0;
  const fixed = tested !== null && broken === 0;
  const total = allBackendOrders.length;
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
              disabled={progress[i] === 3 || found}
              onClick={() => setTurns([...turns, i])}
            >
              {serviceSteps[progress[i]] ?? "처리 끝"}
            </button>
          </div>
        ))}
        {found && (
          <p className={s.warning} role="status">
            표 한 장인데 두 사람이 표를 받았어요. 찾았어요!
          </p>
        )}
        {stuck && (
          <p className={s.tip} role="status">
            이번 순서에서는 표가 한 장만 발급됐어요. 다시 시작해 순서를
            바꿔보세요.
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
        {!found ? (
          <>
            <h2>표가 두 장 발급되는 순서를 찾아보세요</h2>
            <p className={s.tip}>
              남은 표는 한 장이에요. 두 사람의 신청이 겹치도록 창구 버튼을
              번갈아 눌러 보세요.
            </p>
            <div className={s.keys}>
              <button
                onClick={() => {
                  setTurns([]);
                  setHint(false);
                }}
              >
                처음부터 다시
              </button>
              <button aria-pressed={hint} onClick={() => setHint(!hint)}>
                힌트 보기
              </button>
            </div>
            {hint && (
              <p className={s.tip}>
                두 사람이 모두 ‘남은 자리 확인’을 마친 뒤에야 누군가의 ‘자리
                차감’이 일어나면 어떻게 될까요?
              </p>
            )}
          </>
        ) : (
          <>
            <h2>어떻게 고치면 될까요?</h2>
            <p className={s.tip}>
              방법을 고르면 두 사람의 3단계가 겹칠 수 있는 {total}가지 순서
              모두에 돌려봐요.
            </p>
            <fieldset className={s.choices}>
              <legend className={s.legend}>고치는 방법</legend>
              {backendFixes.map((f) => (
                <label className={s.option} key={f.id}>
                  <input
                    type="radio"
                    name="fix"
                    checked={fix === f.id}
                    onChange={() => {
                      setFix(f.id);
                      setTested(null);
                    }}
                  />
                  <span>
                    {f.label}
                    <small className={s.tip}> {f.note}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              className="btn primary"
              disabled={fix === null}
              onClick={() => {
                if (fix) {
                  setTested(fix);
                  record(countOversold(fix) === 0);
                }
              }}
            >
              {total}가지 순서로 시험하기
            </button>
            {tested && (
              <p role="status" className={fixed ? s.clear : s.warning}>
                {fixed
                  ? `${total}가지 순서 모두에서 표가 한 장만 발급됐어요.`
                  : `${total}가지 순서 중 ${broken}가지에서 여전히 표가 두 장 나가요.${
                      tested === "recheck"
                        ? " 확인과 차감 사이가 비어 있으면 겹치는 순서가 남아요."
                        : " 다른 방법을 골라 다시 시험해보세요."
                    }`}
              </p>
            )}
            {fixed && (
              <button className="btn primary" onClick={finish}>
                마치기
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}

export function Data({ finish }: PlayProps) {
  const [exclude, setExclude] = useState(false),
    [unique, setUnique] = useState(false);
  return (
    <Rounds
      title="입장 기록 · 16건"
      rounds={dataRounds}
      finish={finish}
      board={
        <>
          <div className={s.records}>
            {visits.map(([name, cancelled], i) => (
              <span key={i} className={cancelled ? s.cancelled : undefined}>
                {name}
                {cancelled && " (취소)"}
              </span>
            ))}
          </div>
          <label className={s.option}>
            <input
              type="checkbox"
              checked={exclude}
              onChange={(e) => setExclude(e.target.checked)}
            />
            취소한 기록 빼기
          </label>
          <label className={s.option}>
            <input
              type="checkbox"
              checked={unique}
              onChange={(e) => setUnique(e.target.checked)}
            />
            같은 사람은 한 번만 세기
          </label>
          <output className={s.number} aria-live="polite">
            지금 규칙으로 세면 {countVisits(exclude, unique)}
          </output>
        </>
      }
    />
  );
}
export const AI = ({ finish }: PlayProps) => (
  <Rounds title="안내 봇 답변 채점표" rounds={aiRounds} finish={finish} />
);
export const Security = ({ finish }: PlayProps) => (
  <Rounds title="신청 내역 접근 요청" rounds={securityRounds} finish={finish} />
);
export const Cloud = ({ finish }: PlayProps) => (
  <Rounds title="새 버전 관제 화면" rounds={cloudRounds} finish={finish} />
);
