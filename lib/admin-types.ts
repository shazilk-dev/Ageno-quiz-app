import type { QuizResponse } from "@/types/quiz";

// The shapes the admin dashboard and reports routes return (see lib/server/admin-reports.ts).

export interface ReportRow {
  id: string;
  quizId: string;
  quizTitle: string;
  userId: string;
  userName: string;
  score: number | null;
  /** Epoch ms, or null when the response doesn't have it. */
  startedAt: number | null;
  submittedAt: number | null;
  tabSwitchCount: number;
  fullscreenExits: number;
  blurCount: number;
  difficulty: string;
}

export interface ReportsPage {
  rows: ReportRow[];
  /** Pass back to get the next (older) page; null when this was the last. */
  nextCursor: string | null;
  /** Every finished result, not just this page. */
  total: number;
  quizzes: { id: string; title: string }[];
}

export interface DashboardData {
  totals: { users: number; quizzes: number; attempts: number; averageScore: number };
  recentQuizzes: { id: string; title: string; createdAt: number }[];
  /** The latest results (more than the list shows, for the charts). */
  recent: ReportRow[];
}

/** A report row as the chart components expect a response. */
export const toQuizResponse = (row: ReportRow): QuizResponse => ({
  ...row,
  score: row.score ?? undefined,
  startedAt: row.startedAt ?? undefined,
  submittedAt: row.submittedAt ?? undefined,
  difficulty: row.difficulty as QuizResponse["difficulty"],
});
