"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import s from "./games.module.css";

export const GameCheckContext = createContext<(passed: boolean) => void>(
  () => {},
);
export type PlayProps = { finish: () => void };

export function Checkpoint({ error, finish }: PlayProps & { error: string }) {
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
export function Board({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={s.board} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

// 코드를 모르는 사람을 위한 짧은 용어 설명.
export function Terms({ items }: { items: [string, string][] }) {
  return (
    <dl className={s.terms} aria-label="용어 설명">
      {items.map(([term, meaning]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
