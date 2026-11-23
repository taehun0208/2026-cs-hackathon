"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  createAnalyticsClient,
  ANALYTICS_PAUSED_KEY,
  type AnalyticsStatus,
} from "../lib/analytics-client";
import { pilotCodes, type ParticipantCode } from "../lib/analytics-schema";
export function useAnalytics(ready = true) {
  const client = useRef<ReturnType<typeof createAnalyticsClient> | null>(null),
    loaded = useRef(false);
  const [status, setStatus] = useState<AnalyticsStatus>({
    enabled: false,
    token: null,
    participantCode: null,
    phase: "loading",
    message: "",
  });
  useEffect(() => {
    let alive = true;
    loaded.current = false;
    const instance = createAnalyticsClient({
      session: {
        getItem: (k) => sessionStorage.getItem(k),
        setItem: (k, v) => sessionStorage.setItem(k, v),
        removeItem: (k) => sessionStorage.removeItem(k),
      },
      preferences: {
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => localStorage.setItem(k, v),
        removeItem: (k) => localStorage.removeItem(k),
      },
      onStatus: (s) => {
        if (alive) setStatus(s);
      },
    });
    client.current = instance;
    const changed = (event: StorageEvent) => {
      if (event.key === ANALYTICS_PAUSED_KEY || event.key === null) {
        instance.pause(false);
        if (event.newValue === null) void instance.load();
      }
    };
    window.addEventListener("storage", changed);
    return () => {
      alive = false;
      window.removeEventListener("storage", changed);
      instance.dispose();
    };
  }, []);
  useEffect(() => {
    if (ready && !loaded.current && client.current) {
      loaded.current = true;
      void client.current.load();
    }
  }, [ready]);
  return { status, client };
}
export function AnalyticsSettings({
  analytics,
}: {
  analytics: ReturnType<typeof useAnalytics>;
}) {
  const { status, client } = analytics;
  const [code, setCode] = useState<ParticipantCode>(null);
  useEffect(() => {
    setCode(status.participantCode);
  }, [status.participantCode]);
  const busy = status.phase === "loading" || status.phase === "saving";
  const statusLabel =
    status.phase === "loading"
      ? "설정 확인 중"
      : status.phase === "saving"
        ? "변경 중"
        : status.phase === "error"
          ? "확인 필요"
          : status.enabled
            ? "켜짐"
            : "꺼짐";
  return (
    <details className="analytics-settings" aria-busy={busy}>
      <summary>
        체험 개선 참여 <span className="analytics-status">{statusLabel}</span>
      </summary>
      <p>
        원하면 시작·실행·도움 이용·회고 저장·비교·다음 활동 선택을 최대 30일
        기록해요. 코드·질문·회고 원문과 이름은 분석에 넣지 않아요.
      </p>
      <label className="pilot-code-label">
        파일럿 참여 번호 (안내받은 경우만)
        <select
          value={code ?? ""}
          disabled={busy || status.enabled}
          onChange={(e) => setCode((e.target.value || null) as ParticipantCode)}
        >
          <option value="">일반 참여</option>
          {pilotCodes.map((c) => (
            <option key={c} value={c}>
              {c === "QA"
                ? "QA · 진행자 점검용"
                : c.startsWith("S")
                  ? `${c} · 3명 예비테스트`
                  : `${c} · 12명 파일럿`}
            </option>
          ))}
        </select>
      </label>
      <p className="analytics-note">
        번호가 있다면 참여를 켜기 전에 골라주세요.
      </p>
      <label className="consent-inline">
        <input
          type="checkbox"
          checked={status.enabled}
          disabled={busy}
          onChange={(e) =>
            void client.current?.setConsent(e.target.checked, code)
          }
        />{" "}
        활동 기록 수집에 동의하고 개선에 참여해요. (선택)
      </label>
      <p>
        꺼도 체험할 수 있어요. 끄면 분석 기록만 지워지고 코드와 회고는 남아요.
      </p>
      {status.phase === "error" && (
        <button
          className="btn secondary compact"
          onClick={() => void client.current?.setConsent(false, null)}
        >
          참여 끄기·삭제 다시 시도
        </button>
      )}
      <p role="status">{status.message}</p>
      <Link href="/pilot">학생 파일럿 진행 안내</Link>
    </details>
  );
}
