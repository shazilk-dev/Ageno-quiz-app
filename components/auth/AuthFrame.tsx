import type { ReactNode } from "react";
import { Card } from "@/components/ui";

interface AuthFrameProps {
  /** The mono label above the title, e.g. "// SIGN IN". */
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Under the card: the link to the other auth page. */
  footer?: ReactNode;
}

/**
 * The shell for the sign-in, sign-up, reset and verify pages: the dark surface with the faint grid, and one
 * centred card. The page header and footer come from the (auth) layout, not from here.
 */
export default function AuthFrame({ eyebrow, title, description, children, footer }: AuthFrameProps) {
  return (
    <div className="relative flex-1 overflow-hidden bg-bg text-text">
      <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-10 sm:py-16">
        <Card className="rise p-6 sm:p-8">
          <p className="text-label">{eyebrow}</p>
          <h1 className="mt-2 text-3xl">{title}</h1>
          {description && <p className="mt-2 text-text-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <div className="mt-6 text-center text-text-muted">{footer}</div>}
      </div>
    </div>
  );
}
