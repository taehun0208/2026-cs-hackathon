import type { Metadata } from "next";
import GameLab from "./game-lab";
import { missions } from "../../lib/missions";

export const metadata: Metadata = { title: "게임으로 배우기 | 해보기" };

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string }>;
}) {
  const query = await searchParams;
  return (
    <GameLab initialTrack={missions.find((m) => m.id === query.track)?.id} />
  );
}
