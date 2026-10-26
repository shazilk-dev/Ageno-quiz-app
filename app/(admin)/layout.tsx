import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentAdminAccess } from "@/lib/server/admin-access";
import AdminShell from "./AdminShell";

// Depends on the visitor's cookies, so it is never prerendered or cached.
export const dynamic = "force-dynamic";

/**
 * The gate for every admin screen. It runs on the server before anything is sent: the session cookie
 * is verified with Firebase and the role is checked, so a non-admin never receives an admin page,
 * whatever their browser does. (The client-side check inside AdminShell is only for the UI.)
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await currentAdminAccess();

  if (access.state === "signed-out") {
    const back = (await headers()).get("x-pathname") || "/dashboard";
    redirect(`/sign-in?redirectTo=${encodeURIComponent(back)}`);
  }
  if (access.state === "not-admin") redirect("/");

  return <AdminShell>{children}</AdminShell>;
}
