// app/layout.tsx
import "./globals.css";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/Toast";
import { AuthProvider } from "@/contexts/auth-context";

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

// Browser chrome (mobile address bar) matches the ink shell. A raw hex: viewport metadata cannot read CSS
// variables, so this mirrors --color-ink in app/theme.css. `colorScheme: "dark"` joins it once every
// screen is migrated (P7.6); until then most pages are still light.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 5.0, // Allow zooming for better accessibility
  userScalable: true, // Allow zooming for better accessibility
  themeColor: "#0e1116",
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
      className={`scroll-smooth ${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <head>
        <meta name="format-detection" content="telephone=no, date=no, email=no, address=no" />
      </head>
      <body className="font-sans antialiased text-gray-800 bg-white overscroll-none">
        <div className="min-h-screen flex flex-col relative overflow-x-clip">
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </div>
        {/* Skip to main content link for accessibility */}
        <div className="fixed top-0 left-0 z-50">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:p-4 focus:block focus:bg-white focus:text-teal-deep"
          >
            Skip to main content
          </a>
        </div>
      </body>
    </html>
  );
}
