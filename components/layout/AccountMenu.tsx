"use client";

import { LayoutDashboard, ListChecks, LogOut, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

function useSignOut() {
  const { logout } = useAuth();
  const router = useRouter();
  return async () => {
    await logout();
    router.push("/sign-in");
  };
}

function displayNameOf(user: { displayName: string | null; email: string | null }) {
  return user.displayName || user.email?.split("@")[0] || "Account";
}

/** Signed-out actions, or the account menu. Desktop only; the mobile drawer has its own copy of these links. */
export default function AccountMenu() {
  const { user, loading, isAdmin } = useAuth();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close on outside click, Escape and focus leaving the menu.
  useEffect(() => {
    if (!open) return;
    const items = () =>
      Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
      );
    items()[0]?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const list = items();
      const index = list.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        list[(index + 1) % list.length]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        list[(index - 1 + list.length) % list.length]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        list[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        list[list.length - 1]?.focus();
      } else if (event.key === "Tab") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (loading) {
    return <Skeleton className="size-10 rounded-full" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }

  const name = displayNameOf(user);
  const itemClass =
    "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-text-body transition-fast hover:bg-surface hover:text-text focus-visible:bg-surface focus-visible:text-text focus-visible:outline-none";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 place-items-center rounded-full"
      >
        <span className="grid size-9 place-items-center rounded-full border border-border-strong bg-surface-raised font-mono font-semibold text-link text-sm transition-fast hover:border-accent">
          {name.charAt(0).toUpperCase()}
        </span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-64 rounded-lg border border-border-strong bg-surface-raised p-1.5 shadow-float"
        >
          <div className="px-3 py-2">
            <p className="truncate font-medium text-sm">{name}</p>
            {user.email && (
              <p className="truncate text-text-muted text-xs">{user.email}</p>
            )}
          </div>
          <div role="none" className="my-1 border-t border-border" />
          <Link
            href="/profile"
            role="menuitem"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <User className="size-4" aria-hidden="true" />
            My profile
          </Link>
          <Link
            href="/my-quizzes"
            role="menuitem"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <ListChecks className="size-4" aria-hidden="true" />
            My quizzes
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard"
              role="menuitem"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              Admin dashboard
            </Link>
          )}
          <div role="none" className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            className={cn(itemClass, "hover:text-error focus-visible:text-error")}
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Account block for the mobile drawer. */
export function MobileAccount() {
  const { user, loading, isAdmin } = useAuth();
  const signOut = useSignOut();

  if (loading) return <Skeleton className="h-11 w-full" />;

  if (!user) {
    return (
      <div className="flex flex-col gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-up">Sign up</Link>
        </Button>
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  const rowClass =
    "flex min-h-12 items-center text-lg text-text transition-fast hover:text-link";

  return (
    <div>
      <p className="truncate font-medium">{displayNameOf(user)}</p>
      {user.email && (
        <p className="truncate text-sm text-text-muted">{user.email}</p>
      )}
      <ul className="mt-3 flex flex-col">
        <li className="border-t border-border">
          <Link href="/profile" className={rowClass}>
            My profile
          </Link>
        </li>
        {isAdmin && (
          <li className="border-t border-border">
            <Link href="/dashboard" className={rowClass}>
              Admin dashboard
            </Link>
          </li>
        )}
        <li className="border-t border-border">
          <button
            type="button"
            className={cn(rowClass, "w-full hover:text-error")}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </li>
      </ul>
    </div>
  );
}
