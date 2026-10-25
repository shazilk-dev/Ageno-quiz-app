import type { ReactNode } from "react";
import Footer from "./Footer";
import Header from "./Header";

interface SiteFrameProps {
  children: ReactNode;
  /** Pass false on screens that need the full height (the exam). Default true. */
  footer?: boolean;
  /** Pass false to hide the site header (the exam brings its own top bar). Default true. */
  header?: boolean;
}

/**
 * The shared shell: header, main content (the skip-link target), footer. Used by the route-group layouts
 * so no page renders its own header.
 */
export default function SiteFrame({
  children,
  footer = true,
  header = true,
}: SiteFrameProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {header && <Header />}
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
      {footer && <Footer />}
    </div>
  );
}
