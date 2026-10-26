import type { Metadata } from "next";
import { getLeaderboard, type LeaderboardDTO } from "@/lib/server/leaderboard";
import { getSessionUser } from "@/lib/server/session";
import LeaderboardClient from "./LeaderboardClient";

export const metadata: Metadata = { title: "Leaderboard" };

/** Rendered with the unfiltered board already in it, for signed-in people (the board is for them only). */
export default async function LeaderboardPage() {
  const session = await getSessionUser();
  let board: LeaderboardDTO | null = null;
  if (session) {
    try {
      board = await getLeaderboard({});
    } catch (error) {
      console.error("Could not load the leaderboard:", error);
    }
  }
  return <LeaderboardClient initialBoard={board} />;
}
