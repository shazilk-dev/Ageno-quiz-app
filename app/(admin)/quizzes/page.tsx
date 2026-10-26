import type { Metadata } from "next";
import { loadForAdmin } from "@/lib/server/admin-access";
import { listAdminQuizzes } from "@/lib/server/admin-quizzes";
import QuizzesClient from "./QuizzesClient";

export const metadata: Metadata = { title: "Quizzes" };

export default async function QuizzesPage() {
  return <QuizzesClient initial={await loadForAdmin(listAdminQuizzes)} />;
}
