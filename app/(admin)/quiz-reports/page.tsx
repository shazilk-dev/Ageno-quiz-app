import type { Metadata } from "next";
import { loadForAdmin } from "@/lib/server/admin-access";
import { getReportsPage } from "@/lib/server/admin-reports";
import ReportsClient from "./ReportsClient";

export const metadata: Metadata = { title: "Quiz reports" };

export default async function QuizReportsPage() {
  return <ReportsClient initial={await loadForAdmin(() => getReportsPage(undefined, undefined))} />;
}
