// app/layout.tsx
import "./globals.css";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Metadata, Viewport } from "next";
import ThemeSync from "@/components/layout/ThemeSync";
import { ToastProvider } from "@/components/ui/Toast";
import { AuthProvider } from "@/contexts/auth-context";
import { themeInitScript } from "@/lib/theme";

// Self-hosted (app/fonts) so a slow or blocked font CDN can never take the app down.
// Italic accent for 1-3 emotional words of a big heading only; never inside the exam.
const instrumentSerif = localFont({
  src: [
    {
      path: "./fonts/instrument-serif-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/instrument-serif-latin-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
});

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/$/, "");

const description =
  "Ageno Quiz is the assessment platform of Agenoverse. Join a quiz with an access code, take it on the clock and see how you did.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ageno Quiz",
    template: "%s | Ageno Quiz",
  },
  description,
  applicationName: "Ageno Quiz",
  authors: [{ name: "CodeRiders Development Team" }],
  keywords: ["quiz", "assessment", "exam", "learning", "Agenoverse"],
  creator: "CodeRiders Development Team",
  publisher: "Agenoverse",
  category: "education",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Ageno Quiz",
    description,
    siteName: "Ageno Quiz",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ageno Quiz",
    description,
  },
  // Icons come from app/icon.svg, app/favicon.ico and app/apple-icon.png.
  // The OG image comes from app/opengraph-image.tsx.
};

// Browser chrome (mobile address bar). Raw hexes: viewport metadata cannot read CSS variables, so these
// mirror --color-bone and --color-ink in app/theme.css. They follow the OS; a manual choice that differs from
// the OS changes the page but not the address bar colour.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 5.0, // Allow zooming for better accessibility
  userScalable: true, // Allow zooming for better accessibility
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Light is the default; the script below switches it before the first paint when the visitor chose otherwise.
      data-theme="light"
      className={`scroll-smooth ${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <meta name="format-detection" content="telephone=no, date=no, email=no, address=no" />
      </head>
      <body className="bg-bg font-sans text-text antialiased overscroll-none">
        {/* The first thing a keyboard user reaches. No wrapper element: it would be page content outside every landmark. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-0 focus:left-0 focus:z-50 focus:block focus:bg-surface focus:p-4 focus:text-text"
        >
          Skip to main content
        </a>
        <div className="min-h-screen flex flex-col relative overflow-x-clip">
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </div>
        <ThemeSync />
        {/* Real visitors' load and interaction timings per route (Vercel dashboard); does nothing elsewhere. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
