import type { ExamQuestion, SubmitResult } from "@/lib/exam/types";

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

/** One thing the browser reported during an attempt; `at` is the server's clock when it arrived (epoch ms). */
export interface AttemptEventDTO {
  type: "tab_hidden" | "window_blur" | "fullscreen_exit";
  at: number;
}

/**
 * One finished attempt as an admin sees it (`GET /api/admin/reports/[attemptId]`): what the person picked,
 * the key and reasons from the attempt's own copy of the questions, and what was recorded while they took it.
 */
export interface AdminAttemptDetail {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  difficulty: string;
  player: { id: string; name: string; email: string };
  /** Epoch ms. */
  startedAt: number;
  submittedAt: number;
  /** The quiz marks answers itself. When false there is no score and the admin checks the answers by hand. */
  graded: boolean;
  /** The questions as they were during the attempt (the same shape the player saw). */
  questions: ExamQuestion[];
  /** Score, picks and, always for an admin, the review with the key. */
  result: SubmitResult;
  /** In the order they arrived; empty when nothing was recorded or the attempt predates the record. */
  events: AttemptEventDTO[];
  /** More events happened than are kept (the counts in `result` are still right). */
  eventsTruncated: boolean;
}

export interface DashboardData {
  totals: { users: number; quizzes: number; attempts: number; averageScore: number };
  recentQuizzes: { id: string; title: string; createdAt: number }[];
  /** The latest results (more than the list shows, for the charts). */
  recent: ReportRow[];
}

/** One row of the Users screen (`GET /api/admin/users`). */
export interface AdminUserDTO {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  emailVerified: boolean;
  /** Epoch ms; null when the profile has no such time. */
  createdAt: number | null;
  lastLoginAt: number | null;
}
