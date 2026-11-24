"use client";

import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowRight, Check, X } from "lucide-react";
import s from "./games.module.css";
import { Board, GameCheckContext, type PlayProps } from "./shared";
import { shuffleOrder, type Round } from "../../lib/game-rounds";

// 상황 카드 → 선택 → 판정하기 → 해설. 정답은 답한 뒤에만 보여줘요.
export function Rounds({
  rounds,
  title,
  board,
  finish,
  shuffle = false,
}: PlayProps & {
  rounds: Round[];
  title: string;
  board?: ReactNode;
  shuffle?: boolean;
}) {
  const record = useContext(GameCheckContext);
  const [index, setIndex] = useState(0),
    [choice, setChoice] = useState<number | null>(null),
    [revealed, setRevealed] = useState(false),
    [results, setResults] = useState<boolean[]>([]),
    [summary, setSummary] = useState(false);
  // 처음에는 원래 순서로 그리고, 화면이 열린 뒤에 섞어요(서버 렌더와 어긋나지 않게).
  const [orders, setOrders] = useState<number[][]>(() =>
    rounds.map((r) => r.options.map((_, i) => i)),
  );
  useEffect(() => {
    if (shuffle) setOrders(rounds.map((r) => shuffleOrder(r.options.length)));
  }, [rounds, shuffle]);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextAction = useRef<HTMLButtonElement>(null);
  const feedbackId = useId();
  useEffect(() => {
    if (revealed) nextAction.current?.focus();
  }, [revealed]);
  const round = rounds[index];
  const order = orders[index];
  const answerAt = order.indexOf(round.answer);
  const last = index === rounds.length - 1;
  const focusHeading = () =>
    requestAnimationFrame(() => heading.current?.focus());
  const judge = () => {
    if (choice === null) return;
    const correct = choice === answerAt;
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
              {order.map((original, i) => (
                <label className={s.option} key={original}>
                  <input
                    type="radio"
                    name={`round-${index}`}
                    checked={choice === i}
                    onChange={() => setChoice(i)}
                  />
                  {round.options[original]}
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
                  id={feedbackId}
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
                <button
                  className="btn primary"
                  ref={nextAction}
                  aria-describedby={feedbackId}
                  onClick={next}
                >
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
