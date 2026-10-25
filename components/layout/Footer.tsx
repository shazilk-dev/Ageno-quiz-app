import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { LogoWordmark } from "@/components/brand/LogoWordmark";
import { agenoverseLinks } from "@/lib/navigation";
import { AGENOVERSE_URL, cn } from "@/lib/utils";
import { Container } from "./Container";

// min-h-11: a 44px tap target per link.
const linkClass =
  "inline-flex min-h-11 items-center gap-1 text-text-muted transition-fast hover:text-accent";

/** Slim footer: who we are, where the rest of Agenoverse lives. */
export default function Footer({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    <footer
      data-theme="dark"
      className={cn(
        "border-t border-border bg-ink text-text print:hidden",
        className
      )}
    >
      <Container className="flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href="/"
            aria-label="Ageno Quiz home"
            className="inline-flex min-h-11 items-center"
          >
            <LogoWordmark />
          </Link>
          <p className="mt-2 max-w-[40ch] text-sm text-text-muted">
            Ageno Quiz is part of{" "}
            <a
              href={AGENOVERSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link underline-offset-4 hover:underline"
            >
              Agenoverse
            </a>
            .
          </p>
        </div>

        <nav aria-label="Agenoverse">
          <ul className="flex flex-wrap gap-x-5 text-sm md:justify-end">
            {agenoverseLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {link.label}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>

      <div className="border-t border-border">
        <Container className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-label">{"// LET'S RISE TOGETHER"}</span>
          <span className="text-label">© {year} Agenoverse</span>
        </Container>
      </div>
    </footer>
  );
}
