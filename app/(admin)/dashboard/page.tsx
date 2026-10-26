import type { Metadata } from "next";
import { loadForAdmin } from "@/lib/server/admin-access";
import { getDashboard } from "@/lib/server/admin-reports";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  return <DashboardClient initial={await loadForAdmin(getDashboard)} />;
}
