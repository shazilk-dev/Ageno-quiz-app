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
