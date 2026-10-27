"use client";

import { Lock, Mail, ShieldCheck, User as UserIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Container } from "@/components/layout/Container";
import EmailSection from "@/components/profile/EmailSection";
import PasswordSection from "@/components/profile/PasswordSection";
import ProfileSection from "@/components/profile/ProfileSection";
import SecuritySection from "@/components/profile/SecuritySection";
import { useProfileAction } from "@/components/profile/use-profile-action";
import { Alert, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

type Tab = "profile" | "email" | "password" | "security";

const TABS: { id: Tab; label: string; title: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Profile", title: "Profile", icon: UserIcon },
  { id: "email", label: "Email", title: "Change email address", icon: Mail },
  { id: "password", label: "Password", title: "Change password", icon: Lock },
  { id: "security", label: "Security", title: "Account security", icon: ShieldCheck },
];

/** Account settings. The (user) layout has already made sure someone is signed in. */
export default function ProfilePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");
  const action = useProfileAction();
  const { notice, setNotice } = action;

  // The server knew someone was signed in, so the page is shown; the browser's sign-in is a moment behind.
  if (!user) {
    return (
      <div className="flex-1 bg-bg text-text">
        <Container aria-busy="true" className="space-y-4 py-8 sm:py-10">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-64 w-full" />
        </Container>
      </div>
    );
  }

  const current = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const initial = (user.displayName || user.email || "U").charAt(0).toUpperCase();

  return (
    <div className="flex-1 bg-bg text-text">
      <Container className="py-8 sm:py-10">
        <p className="text-label">{"// ACCOUNT"}</p>
        <div className="mt-3 flex items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-teal font-mono text-lg font-semibold text-ink"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-3xl">{user.displayName || "Your account"}</h1>
            <p className="truncate text-text-muted">{user.email}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
          <nav aria-label="Account settings" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <ul className="flex gap-1 md:flex-col">
              {TABS.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={tab === id ? "page" : undefined}
                    onClick={() => {
                      setTab(id);
                      setNotice(null);
                    }}
                    className={cn(
                      "transition-fast flex min-h-11 w-full items-center gap-3 whitespace-nowrap rounded-md px-3 text-sm",
                      tab === id
                        ? "bg-accent/10 font-medium text-text"
                        : "text-text-muted hover:bg-surface hover:text-text"
                    )}
                  >
                    <Icon
                      className={cn("size-4", tab === id && "text-link")}
                      aria-hidden="true"
                    />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="profile-section-title" className="min-w-0">
            <h2 id="profile-section-title" className="text-2xl">
              {current.title}
            </h2>

            {notice && (
              <Alert variant={notice.type} className="mt-5 max-w-2xl">
                {notice.text}
              </Alert>
            )}

            <div className="mt-6">
              {tab === "profile" && <ProfileSection user={user} action={action} />}
              {tab === "email" && <EmailSection user={user} action={action} />}
              {tab === "password" && <PasswordSection user={user} action={action} />}
              {tab === "security" && <SecuritySection user={user} action={action} />}
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}
