import type { AdminUserDTO, DashboardData, ReportsPage } from "@/lib/admin-types";
import { apiRequest } from "@/lib/api-client";
import type { AdminQuizDetail, AdminQuizSummary, QuizInput } from "@/lib/quiz-schema";

// The admin screens' calls to the admin routes (`app/api/admin/*`). Each sends the signed-in admin's ID
// token; the server checks the role again, so hiding a button here protects nothing by itself.

export interface SavedQuiz {
  id: string;
  /** Goes back with the next save. */
  version: number;
  accessCode: string;
}

export const adminQuizzes = {
  list: async (): Promise<AdminQuizSummary[]> =>
    (await apiRequest<{ quizzes: AdminQuizSummary[] }>("/api/admin/quizzes")).quizzes,

  get: (quizId: string) => apiRequest<AdminQuizDetail>(`/api/admin/quizzes/${quizId}`),

  create: (input: QuizInput) =>
    apiRequest<SavedQuiz>("/api/admin/quizzes", { method: "POST", body: input }),

  save: (quizId: string, input: QuizInput, version: number) =>
    apiRequest<Omit<SavedQuiz, "id">>(`/api/admin/quizzes/${quizId}`, {
      method: "PUT",
      body: { ...input, version },
    }),

  /** Moves the quiz to the trash; nothing is deleted. */
  trash: (quizId: string) =>
    apiRequest<{ responseCount: number }>(`/api/admin/quizzes/${quizId}`, { method: "DELETE" }),

  restore: (quizId: string) =>
    apiRequest<{ restored: true }>(`/api/admin/quizzes/${quizId}/restore`, { method: "POST" }),

  /** Deletes a quiz in the trash for good. `title` is what the admin typed. */
  deleteForever: (quizId: string, title: string) =>
    apiRequest<{ deletedResults: number }>(`/api/admin/quizzes/${quizId}/delete-forever`, {
      method: "POST",
      body: { title },
    }),
};

export const adminUsers = {
  /** Up to 500 people, newest first, and how many exist in all. */
  list: () => apiRequest<{ users: AdminUserDTO[]; total: number }>("/api/admin/users"),

  setRole: (uid: string, role: "admin" | "user") =>
    apiRequest<{ id: string; role: "admin" | "user" }>(`/api/admin/users/${uid}`, {
      method: "PATCH",
      body: { role },
    }),

  remove: (uid: string) =>
    apiRequest<{ deleted: true }>(`/api/admin/users/${uid}`, { method: "DELETE" }),
};

export const adminReports = {
  /** A page of finished results, newest first. Pass the previous page's `nextCursor` for the next one. */
  page: ({ cursor, limit, quizId }: { cursor?: string | null; limit?: number; quizId?: string } = {}) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (limit) params.set("limit", String(limit));
    if (quizId) params.set("quizId", quizId);
    const query = params.toString();
    return apiRequest<ReportsPage>(`/api/admin/reports${query ? `?${query}` : ""}`);
  },
  dashboard: () => apiRequest<DashboardData>("/api/admin/stats"),
};
