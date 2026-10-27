"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoWordmark } from "@/components/brand/LogoWordmark";
import { useAuth } from "@/contexts/auth-context";
import { adminLink, mainNav, myQuizzesLink, type NavLink } from "@/lib/navigation";
import { AGENOVERSE_URL, cn } from "@/lib/utils";
import AccountMenu, { MobileAccount } from "./AccountMenu";
import { Container } from "./Container";
import ThemeToggle from "./ThemeToggle";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The one site header. Always 64px tall; scrolling only adds a bottom border. Rendered by SiteFrame
 * from the shared layouts, never by individual pages.
 */
export default function Header({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  // The drawer is "open" only for the route it was opened on, so navigating closes it.
  const [openOnPath, setOpenOnPath] = useState<string | null>(null);
  const open = openOnPath === pathname;

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const links: NavLink[] = [
    ...mainNav,
    ...(user ? [myQuizzesLink] : []),
    ...(user && isAdmin ? [adminLink] : []),
  ];

  // Height never changes, so there is no feedback loop with scroll anchoring. The border flips with
  // hysteresis (on above 48px, off below 4px) and the handler is throttled to one run per frame.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > 4 : y > 48));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // While open: lock page scroll, close on Escape, keep Tab inside the drawer.
  useEffect(() => {
    if (!open) return;

    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenOnPath(null);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])"
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 h-(--nav-height) border-b bg-bg/90 text-text backdrop-blur-md transition-[border-color] duration-200 print:hidden",
          scrolled || open ? "border-border" : "border-transparent",
          className
        )}
      >
        <Container className="flex h-full items-center justify-between gap-6">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center"
          >
            <LogoWordmark byline />
          </Link>

          <nav aria-label="Main" className="hidden flex-1 md:block">
            <ul className="flex items-center gap-1">
              {links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-fast hover:text-link",
                        active ? "text-link" : "text-text-muted"
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={AGENOVERSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden min-h-11 items-center gap-1 rounded-md px-2 font-mono text-text-muted text-xs transition-fast hover:text-link lg:inline-flex"
            >
              Agenoverse
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
            <ThemeToggle className="hidden md:inline-flex" />
            <div className="hidden md:block">
              <AccountMenu />
            </div>
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpenOnPath(pathname)}
              className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-text transition-fast hover:text-link md:hidden"
            >
              <Menu className="size-6" aria-hidden="true" />
            </button>
          </div>
        </Container>
      </header>

      {/* Mobile drawer. `inert` keeps it out of the tab order and the a11y tree while closed. */}
      <div className="md:hidden">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close menu"
          onClick={() => setOpenOnPath(null)}
          className={cn(
            "fixed inset-0 z-50 bg-ink/70 transition-base print:hidden",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
        <div
          ref={drawerRef}
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          inert={!open}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col border-l border-border bg-bg text-text transition-base print:hidden",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex h-(--nav-height) items-center justify-end px-4">
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close menu"
              onClick={() => setOpenOnPath(null)}
              className="inline-flex size-11 items-center justify-center rounded-md text-text transition-fast hover:text-link"
            >
              <X className="size-6" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8">
            <nav aria-label="Mobile">
              <ul className="flex flex-col">
                {links.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <li key={link.href} className="border-b border-border">
                      <Link
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-14 items-center text-2xl transition-fast hover:text-link",
                          active ? "text-link" : "text-text"
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-8">
              <MobileAccount />
            </div>
            <ThemeToggle variant="segmented" className="mt-8" />
            <a
              href={AGENOVERSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex min-h-11 items-center gap-1 pt-8 font-mono text-text-muted text-xs transition-fast hover:text-link"
            >
              Agenoverse
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
