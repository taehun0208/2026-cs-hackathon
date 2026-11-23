"use client";

import { useContext, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import s from "./games.module.css";
import { Board, GameCheckContext, type PlayProps } from "./shared";
import type { Round } from "../../lib/game-rounds";

// 상황 카드 → 선택 → 판정하기 → 해설. 정답은 답한 뒤에만 보여줘요.
export function Rounds({
  rounds,
  title,
  board,
  finish,
}: PlayProps & { rounds: Round[]; title: string; board?: ReactNode }) {
  const record = useContext(GameCheckContext);
  const [index, setIndex] = useState(0),
    [choice, setChoice] = useState<number | null>(null),
    [revealed, setRevealed] = useState(false),
    [results, setResults] = useState<boolean[]>([]),
    [summary, setSummary] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const round = rounds[index];
  const last = index === rounds.length - 1;
  const focusHeading = () =>
    requestAnimationFrame(() => heading.current?.focus());
  const judge = () => {
    if (choice === null) return;
    const correct = choice === round.answer;
    record(correct);
    setResults([...results, correct]);
    setRevealed(true);
  };
  const next = () => {
    if (last) setSummary(true);
    else {
      setIndex(index + 1);
      setChoice(null);
      setRevealed(false);
    }
    focusHeading();
  };
  const score = results.filter(Boolean).length;
  return (
    <>
      <Board title={title}>
        {board}
        {!summary && (
          <>
            <p className={s.readout}>
              상황 {index + 1} / {rounds.length}
            </p>
            <ul className={s.facts}>
              {round.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </>
        )}
      </Board>
      <section className={s.tools}>
        {!summary ? (
          <>
            <h2 tabIndex={-1} ref={heading}>
              {round.question}
            </h2>
            <fieldset className={s.choices} disabled={revealed}>
              <legend className={s.legend}>답 고르기</legend>
              {round.options.map((option, i) => (
                <label className={s.option} key={option}>
                  <input
                    type="radio"
                    name={`round-${index}`}
                    checked={choice === i}
                    onChange={() => setChoice(i)}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
            {!revealed ? (
              <button
                className="btn primary"
                disabled={choice === null}
                onClick={judge}
              >
                판정하기
              </button>
            ) : (
              <>
                <div
                  role="status"
                  className={results[index] ? s.right : s.wrong}
                >
                  <strong>
                    {results[index] ? <Check size={16} /> : <X size={16} />}{" "}
                    {results[index] ? "맞았어요" : "다시 생각해봐요"}
                  </strong>
                  {!results[index] && (
                    <p>정답: {round.options[round.answer]}</p>
                  )}
                  <p>{round.why}</p>
                </div>
                <button className="btn primary" onClick={next}>
                  {last ? "결과 보기" : "다음 상황"} <ArrowRight size={16} />
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <h2 tabIndex={-1} ref={heading}>
              {rounds.length}개 중 {score}개를 맞혔어요
            </h2>
            <ol className={s.recap}>
              {rounds.map((r, i) => (
                <li key={r.question + i}>
                  {results[i] ? "맞음" : "틀림"} · {r.options[r.answer]}
                </li>
              ))}
            </ol>
            <button className="btn primary" onClick={finish}>
              마치기 <ArrowRight size={16} />
            </button>
          </>
        )}
      </section>
    </>
  );
}
