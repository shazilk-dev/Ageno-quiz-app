import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AdminPageProps {
  title: string;
  description?: string;
  /** A link back to the list this page belongs to. */
  back?: { href: string; label: string };
  /** Buttons for the top right (New quiz, Edit). */
  actions?: ReactNode;
  /** Width of the content column. Forms read better narrow; tables need room. */
  width?: "narrow" | "wide";
  children: ReactNode;
}

/**
 * The frame the admin pages share: title, optional back link and actions, and the paper (light) theme the
 * rest of the admin sits on until its full restyle (P7.3). Pages don't render a `<main>`; the layout does.
 */
export function AdminPage({
  title,
  description,
  back,
  actions,
  width = "wide",
  children,
}: AdminPageProps) {
  return (
    <div
      data-theme="light"
      className={cn(
        "mx-auto w-full px-4 py-8 text-text",
        width === "narrow" ? "max-w-3xl" : "max-w-6xl"
      )}
    >
      <header className="mb-8">
        {back && (
          <Link
            href={back.href}
            className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-text-muted transition-fast hover:text-text"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl">{title}</h1>
            {description && <p className="mt-2 max-w-[65ch] text-text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </header>
      {children}
    </div>
  );
}
