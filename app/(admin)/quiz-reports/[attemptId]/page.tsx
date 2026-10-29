import type { Metadata } from "next";
import { loadForAdmin } from "@/lib/server/admin-access";
import { getAttemptForAdmin } from "@/lib/server/attempts";
import AttemptDetailClient from "./AttemptDetailClient";

export const metadata: Metadata = { title: "Result" };

type PageProps = { params: Promise<{ attemptId: string }> };

export default async function AttemptDetailPage({ params }: PageProps) {
  const { attemptId } = await params;
  return (
    <AttemptDetailClient
      attemptId={attemptId}
      initial={await loadForAdmin(() => getAttemptForAdmin(attemptId))}
    />
  );
}
