import type { Metadata } from "next";
import { loadForAdmin } from "@/lib/server/admin-access";
import { getReportsPage } from "@/lib/server/admin-reports";
import ReportsClient from "./ReportsClient";

export const metadata: Metadata = { title: "Quiz reports" };

type PageProps = { searchParams: Promise<{ userId?: string | string[] }> };

export default async function QuizReportsPage({ searchParams }: PageProps) {
  // `?userId=` shows one person's results (the Users screen links here).
  const raw = (await searchParams).userId;
  const userId = typeof raw === "string" && raw ? raw : undefined;
  return (
    <ReportsClient
      userId={userId}
      initial={await loadForAdmin(() => getReportsPage(undefined, undefined, undefined, userId))}
    />
  );
}
