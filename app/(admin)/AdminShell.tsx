"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AdminProtected from "@/components/AdminProtected";
import { LogoWordmark } from "@/components/brand/LogoWordmark";
import { Container } from "@/components/layout/Container";
import { Badge, Button, EmptyState, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Quizzes", href: "/quizzes" },
  { label: "Users", href: "/users" },
  { label: "Reports", href: "/quiz-reports" },
];

function NavLinks({ pathname, className }: { pathname: string; className?: string }) {
  return (
    <ul className={cn("flex items-center gap-1", className)}>
      {ADMIN_LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "transition-fast inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm hover:text-accent",
                active ? "text-accent" : "text-text-muted"
              )}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The admin chrome: a dark top bar over a light (bone) working area. Access is decided on the server
 * before this renders, in `app/(admin)/layout.tsx`; the check here only keeps the UI honest while auth
 * loads. Pages don't render a `<main>`; this does.
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loading } = useAuth();

  return (
    <div data-theme="light" className="min-h-screen bg-bg text-text">
      <header data-theme="dark" className="sticky top-0 z-40 border-b border-border bg-ink text-text print:hidden">
        <Container className="flex h-(--nav-height) items-center justify-between gap-6">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-3">
            <LogoWordmark />
            <Badge variant="outline">Admin</Badge>
          </Link>
          <nav aria-label="Admin" className="hidden flex-1 md:block">
            <NavLinks pathname={pathname} />
          </nav>
          <Link
            href="/"
            className="transition-fast inline-flex min-h-11 items-center px-2 text-sm text-text-muted hover:text-accent"
          >
            Exit admin
          </Link>
        </Container>
        <nav aria-label="Admin" className="overflow-x-auto border-t border-border md:hidden">
          <Container>
            <NavLinks pathname={pathname} className="-mx-3 w-max" />
          </Container>
        </nav>
      </header>

      <main id="main-content">
        {loading ? (
          <div aria-busy="true" aria-label="Loading" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <AdminProtected
            fallback={
              <div className="mx-auto w-full max-w-3xl px-4 py-16">
                <EmptyState
                  title="Admin access required"
                  description="You need to be an administrator to see this page."
                  action={
                    <Button asChild>
                      <Link href="/">Back to the site</Link>
                    </Button>
                  }
                />
              </div>
            }
          >
            {children}
          </AdminProtected>
        )}
      </main>
    </div>
  );
}
