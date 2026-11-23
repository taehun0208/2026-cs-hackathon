import Lab from "./lab";
import { missions } from "../lib/missions";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ track?: string; view?: string }>;
}) {
  const query = await searchParams;
  const track = missions.find((m) => m.id === query.track)?.id;
  const view =
    query.view === "journal" ||
    query.view === "compare" ||
    query.view === "guide"
      ? query.view
      : undefined;
  return <Lab initialTrack={track} initialView={view} />;
}
