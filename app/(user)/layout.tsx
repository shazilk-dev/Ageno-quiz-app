"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Container } from "@/components/layout/Container";
import SiteFrame from "@/components/layout/SiteFrame";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";

/**
 * Pages that belong to a signed-in person (My quizzes, leaderboard, profile). Everyone gets the same
 * rule on every device: while the sign-in state resolves you see a placeholder, and if there is no one
 * signed in you are sent to sign in and brought back here afterwards. The data behind these pages is
 * checked on the server too, so this is about not showing an empty page, not about security.
 */
export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/sign-in?redirectTo=${encodeURIComponent(pathname)}`);
    }
  }, [user, loading, router, pathname]);

  return (
    <SiteFrame>
      {user ? (
        children
      ) : (
        <div data-theme="dark" className="flex-1 bg-bg text-text">
          <Container aria-busy="true" className="space-y-4 py-8 sm:py-10">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </Container>
        </div>
      )}
    </SiteFrame>
  );
}
