"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";

/**
 * Pages that belong to a signed-in person (My quizzes, leaderboard, profile). When the server already
 * knows who is signed in (`serverSignedIn`, from the session cookie) the page shows at once, with the data
 * the server put in it. Otherwise a placeholder shows while the browser's sign-in state resolves. Either
 * way, once the browser knows nobody is signed in, it goes to sign-in and comes back here afterwards. The
 * data is checked on the server too, so this is about not showing an empty page, not about security.
 */
export default function UserGate({
  serverSignedIn,
  children,
}: {
  serverSignedIn: boolean;
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

  if (user || (loading && serverSignedIn)) return children;

  return (
    <div className="flex-1 bg-bg text-text">
      <Container aria-busy="true" className="space-y-4 py-8 sm:py-10">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </Container>
    </div>
  );
}
