import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, BookOpen, FlaskConical } from "lucide-react";
import { missions, type NextActionCandidate } from "../../../../lib/missions";
import { activityLesson } from "../../../../lib/activities";

const kinds = [
  "foundation",
  "extend",
  "study",
  "explore",
  "broader",
  "review",
] as const;
export default async function Activity({
  params,
}: {
  params: Promise<{ kind: string; track: string }>;
}) {
  const route = await params;
  const mission = missions.find((m) => m.id === route.track);
  if (!mission || !kinds.some((kind) => kind === route.kind)) notFound();
  const kind = route.kind as NextActionCandidate["kind"];
  const lesson = activityLesson(kind, mission.id);
  return (
    <>
      <header className="site-header">
        <div className="nav-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <FlaskConical size={23} />
            </span>
            <span>해보기</span>
          </Link>
          <Link className="btn secondary compact" href="/?view=journal">
            나의 기록
          </Link>
        </div>
      </header>
      <main className="wrap activity-page">
        <div className="page-intro">
          <span className="context-tag">
            <BookOpen size={16} aria-hidden="true" /> 다음 활동 ·{" "}
            {mission.title}
          </span>
          <h1>{lesson.title}</h1>
          <p>{lesson.explanation}</p>
        </div>
        <section className="activity-card">
          <h2>직접 해보기</h2>
          <ol>
            {lesson.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {kind === "extend" && (
            <p className="activity-note">
              확장 연습은 별도 편집기나 노트에서 진행해요. 기존 체험의 자동
              검사는 원래 과제 기준이며, 이 확장 활동의 완료를 판정하지 않아요.
            </p>
          )}
        </section>
        <section className="activity-card">
          <h2>작은 예시</h2>
          <pre>{lesson.example}</pre>
        </section>
        <section className="activity-card">
          <h2>마지막으로 확인해요</h2>
          <p>{lesson.check}</p>
        </section>
        <div className="experience-actions">
          <Link className="btn primary" href={`/?track=${mission.id}`}>
            {kind === "foundation" || kind === "explore"
              ? "코드 체험으로 이어가기"
              : "원래 코드 체험 열기"}{" "}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
          <Link className="btn secondary" href="/?view=journal">
            내 기록 다시 보기
          </Link>
        </div>
      </main>
    </>
  );
}
